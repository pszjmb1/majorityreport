/**
 * Majority Report provenance collection
 */
Provenance = new Meteor.Collection('provenance');

getRevisions = function(reportId) {
	return Provenance.find( 
		{ mrOrigin: reportId }, 
		{ sort: { provGeneratedAtTime: -1 }}
	);
};

getLatestRevision = function(reportId) {
	return Provenance.findOne( 
		{ mrOrigin: reportId }, 
		{ sort: { provGeneratedAtTime: -1 }}
	);
};

getRelationsList = function() {
	return Provenance.findOne(
		{mrCollectionType: 'Relations'},
		{sort: {provGeneratedAtTime: -1}}
	);
};

getMediaRelative = function(mediaId) {
	var relative,
		rList = getRelationsList();

	if(rList && rList.provHadMember) {
		relative = _.findWhere(rList.provHadMember, {mrMedia: mediaId});
		
		if(relative && relative.mrRelative) 
			return getLatestRevision(relative.mrRelative);
	}
};

Meteor.methods({
	crisisReport: function(provAttributes) {
		var user = Meteor.user(),
		
		// Validate input ////////////////////////////////////////////////////////
		crisisWithSameTitle = Provenance.findOne({url: provAttributes.dctermsTitle});

		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add a new crisis");

		// ensure the crisis has a dctermsTitle
		if (!provAttributes.dctermsTitle)
			throw new Meteor.Error(422, 'Please fill in the title');

		// ensure the crisis has a dctermsDescription
		if (!provAttributes.dctermsDescription)
			throw new Meteor.Error(422, 'Please fill in the description');

		// check that there are no previous crises with the same title
		if (provAttributes.dctermsTitle && crisisWithSameTitle) {
			throw new Meteor.Error(302, 
				'A crisis with this title already exists', 
				crisisWithSameTitle._id);
		}

		// Enter new crisis entity ///////////////////////////////////////////////
		var now = new Date().getTime();
		// Extend the whitelisted attributes
		var crisis = _.extend(_.pick(provAttributes, 'dctermsTitle', 'dctermsDescription'), {
			provClasses: ['Entity'],
			provType: 'Collection',
			provGeneratedAtTime: now, 
			mrCollectionType: 'Crisis Report',
			provHadMember: []
		});

		// Insert the crisis
		var crisisId = Provenance.insert(crisis);
		
		// Assign an origin provenance ID to be able properly track related revisions, 
		// remains the same across related revisions
		Provenance.update(crisisId, {$set: {mrOrigin: crisisId}});

		// Add a corresponding creation provenance activity ////////////////////
		var userProv = Provenance.findOne({mrUserId:user._id});
		var activity = {
			provClasses:['Activity'],
			provType:'MR: Crisis Report Creation',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: crisisId
		};

		Provenance.insert(activity);

		return crisisId;
	},
	crisisReportInvalidation: function(provAttributes) {
		// Invalidate the record, rather than deleting it  
		var user = Meteor.user();
		var currentCrisisId = provAttributes.currentCrisisId;

		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to remove a crisis");

		// ensure the currentCrisisId has been set
		if (!currentCrisisId)
			throw new Meteor.Error(422, 'Please include the currentCrisisId');

		var now = new Date().getTime(); 
		var currentUser = Provenance.findOne({mrUserId: user});

		var removalActivity = Provenance.insert({
			provClasses:['Activity'],
			provType:'MR: Crisis Report Removal',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: currentUser,
			provInvalidated: currentCrisisId
		});

		Provenance.update(currentCrisisId, {$set: {wasInvalidatedBy: removalActivity}});
	},
	crisisReportRevision: function (provAttributes) {
		reportRevision(provAttributes);
	}, 
	crisisReportMedia: function(provAttributes) {
		var user = Meteor.user(),
			mediaWithSameUrl = Provenance.findOne({provAtLocation: provAttributes.mediaUrl});
		
		// Validate input ////////////////////////////////////////////////////////
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add a new media");

		// ensure the crisis has a mediaUrl
		if (!provAttributes.mediaUrl)
			throw new Meteor.Error(422, 'Please fill in the media URL');

		// ensure the crisis has a dctermsFormat
		if (!provAttributes.dctermsFormat)
			throw new Meteor.Error(422, 'Please select a media format');

		var now = new Date().getTime();
		var userProv = Provenance.findOne({mrUserId:user._id});
		var mediaId;

		// Ensure media doesn't already exists in the current report
		if(mediaWithSameUrl) {
			// Keep track of the existing media id in case media doesn't exist in the current report
			mediaId = mediaWithSameUrl.mrOrigin;

			var report = getLatestRevision(provAttributes.currentCrisisOrigin);
			if( _.findWhere(report.provHadMember, {mrMedia: mediaId}) ) {
				throw new Meteor.Error(422, 'Media already exists in the current report', mediaId);
			}

		} else {
			// Insert new media entity ///////////////////////////////////////////////
			// Extend the whitelisted attributes
			var media = _.extend(_.pick(provAttributes, 'dctermsFormat'), {
				provClasses: ['Entity'],
				provType: 'MR: Media',
				provAtLocation: provAttributes.mediaUrl,
				provGeneratedAtTime: now,
				mrAttribute: {}
			});
			
			mediaId = Provenance.insert(media);
			Provenance.update(mediaId, {$set: {mrOrigin: mediaId}});

			// Add a corresponding creation provenance activity ////////////////////
			var enterActivity = {
				provClasses:['Activity'],
				provType:'MR: Media Insertion',
				provStartedAtTime: now,
				provEndedAtTime: now,
				provWasStartedBy: userProv._id,
				provGenerated: mediaId
			};

			Provenance.insert(enterActivity);

			// TODO: Insert media into a global media provCollection
		}


		// Insert Media into the Report //////////////////////////////////////////
		// Prepare entity that defines mediaId and 
		// its attributes **relative** to the report, i.e. position, dimensions
		var mediaAttribute = {
			provClasses: ['Entity'],
			provType: 'MR: Media Properties',
			provGeneratedAtTime: now,
			mrAttribute: {}
		}; 

		var mediaAttributeId = Provenance.insert(mediaAttribute);
		Provenance.update(mediaAttributeId, {$set: {mrOrigin: mediaAttributeId}});

		// Add a corresponding creation provenance activity ////////////////////
		var activity = {
			provClasses:['Activity'],
			provType:'MR: Media Attribute Insertion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: mediaAttributeId
		};
		
		Provenance.insert(activity);

		// Prepare new revision of the report before inserting the mediaAttribute entity
		var revisionId = reportRevision(provAttributes),
			entity = {
				mrMedia: mediaId,
				mrAttribute: mediaAttributeId
			};

		Provenance.update(revisionId, 
			{ $push: {provHadMember: entity} } 
		);

		return mediaId;
	},
	mediaRevision: function (provAttributes) {
		var user = Meteor.user();

		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add an attribute");

		// ensure that the key of the attribute is entered
		if (!provAttributes.attrKey)
			throw new Meteor.Error(422, "Please enter the attribute label");
		
		// ensure that the value of the attribute is entered
		if (!provAttributes.attrValue)
			throw new Meteor.Error(422, "Please enter the attribute content");

		var now = new Date().getTime(),
				currentUser = Provenance.findOne({mrUserId:user._id});
				attribute = {};

		// Set up the new attributes as an object
		attribute[provAttributes.attrKey] = provAttributes.attrValue;
		
		// Get the exisiting attributes so that we can extend it with our new attribute before updating
		var media = getLatestRevision(provAttributes.currentMediaOrigin),
				existingAttrs = media.mrAttribute;

		var newMedia = {
				mrAttribute: _(existingAttrs).extend(attribute),
				provGeneratedAtTime: now
		};

		delete media._id;
		var revisionId = Provenance.insert(media);
		Provenance.update(revisionId, {$set: newMedia});

		// Add an activity for inserting new attribute /////////////////////////
		var activity = {
			provClasses:['Activity'],
			provType:'MR: Media Attribute Insertion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: currentUser._id,
			provGenerated: revisionId
		};

		Provenance.insert(activity);

		// Add a corresponding revision provenance /////////////////////////////
		var revisionActivity = {
			provClasses:['Derivation'],
			mrReason: 'Media Update',
			provAtTime : now,
			provWasStartedBy: currentUser._id,
			provWasDerivedFrom: {
				provGenerated: revisionId, 
				provDerivedFrom: provAttributes.currentCrisisId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		};
		Provenance.insert(revisionActivity);

		return revisionId;
	},
	mediaAttributeRemove: function (provAttributes) {
		var user = Meteor.user();

		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to remove the attribute");

		// ensure that the key of the attribute is entered
		if (!provAttributes.attrKey)
			throw new Meteor.Error(422, "Please select an appropriate attribute label");

		var now = new Date().getTime(),
				currentUser = Provenance.findOne({mrUserId:user._id});
				attribute = {};
		
		// Get the exisiting attributes so that we can extend it with our new attribute before updating
		var media = getLatestRevision(provAttributes.currentMediaOrigin),
				existingAttrs = media.mrAttribute;

		var newMedia = {
				// Remove the attribute key from the existing list/object
				mrAttribute: _(existingAttrs).omit(provAttributes.attrKey),
				provGeneratedAtTime: now
		};

		delete media._id;
		var revisionId = Provenance.insert(media);
		Provenance.update(revisionId, {$set: newMedia});

		// Add an activity for inserting new attribute /////////////////////////
		var activity = {
			provClasses:['Activity'],
			provType:'MR: Media Attribute Deletion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: currentUser._id,
			provGenerated: revisionId
		};

		Provenance.insert(activity);
		// Add a corresponding revision provenance /////////////////////////////
		var revisionActivity = {
			provClasses:['Derivation'],
			mrReason: 'Media Update',
			provAtTime : now,
			provWasStartedBy: currentUser._id,
			provWasDerivedFrom: {
				provGenerated: revisionId, 
				provDerivedFrom: provAttributes.currentMediaId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		};

		Provenance.insert(revisionActivity);

		return revisionId;
	},
	mediaReportAttributeRevision: function(provAttributes) {
		var user = Meteor.user();
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to update the report");
		
		var now = new Date().getTime(),
			currentUser = Provenance.findOne({mrUserId: user._id});

		
		// Prepare the new information
		var newAttribute = {
			mrAttribute: provAttributes.mrAttribute,
			provGeneratedAtTime: now
		};

		// Clone the latest media attribute and update them
		var attribute = getLatestRevision(provAttributes.currentAttributeOrigin);
		delete attribute._id;

		var revisionId = Provenance.insert(attribute);
		Provenance.update(revisionId, {$set: newAttribute });      
					
		// Add a corresponding revision provenance /////////////////////////////
		var revisionActivity = {
			provClasses:['Derivation'],
			mrReason: 'Media Report Attribute Update',
			provAtTime : now,
			provWasStartedBy: currentUser._id,
			provWasDerivedFrom: {
				provGenerated: revisionId, 
				provDerivedFrom: provAttributes.currentAttributeId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		};

		Provenance.insert(revisionActivity);

		return revisionId;
	},
	mediaRelation: function(provAttributes) {
		var user = Meteor.user();
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add a new relation");

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId: user._id}),
			sourceRelation, 
			targetRelation,
			entry;

		// Insert relation entity
		var relation = {
			provClasses: ['Entity'],
			provType: 'MR: Relation',
			provGeneratedAtTime: now,
			mrSource: provAttributes.source,
			mrTarget: provAttributes.target,
			mrAnnotation: {}
		};

		var relationId = Provenance.insert(relation);
		Provenance.update(relationId, {$set: {mrOrigin: relationId} }); 

		// Add a corresponding creation provenance activity ////////////////////
		var activity = {
			provClasses:['Activity'],
			provType:'MR: Relation Insertion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: relationId
		};

		Provenance.insert(activity);

		addMediaRelative(provAttributes, relationId, true);
		addMediaRelative(provAttributes, relationId, false);

		return relationId;

		// Keep log of the relations (as source and targets) per media items
		function addMediaRelative(provAttributes, relationId, isSource) {
			var now = new Date().getTime(),
				existingEntity = (isSource) ? getMediaRelative(provAttributes.source) : getMediaRelative(provAttributes.target);

			if(existingEntity) {
				var listToUpdate,
					existingId = existingEntity._id,
					newEntity = { provGeneratedAtTime: now };

				// Prepare the entity to update depending on whether the current media is a source or target
				if(isSource) {
					// Prepare the new entity for source media
					newEntity.mrTarget = existingEntity.mrTarget;
					if(!newEntity.mrTarget[provAttributes.target]) {
						newEntity.mrTarget[provAttributes.target] = [];
					}
					listToUpdate = newEntity.mrTarget[provAttributes.target];
				} else {
					// Prepare the new entity for target media
					newEntity.mrSource = existingEntity.mrSource;
					if(!newEntity.mrSource[provAttributes.source]) {
						newEntity.mrSource[provAttributes.source] = [];
					}
					listToUpdate = newEntity.mrSource[provAttributes.source];
				}

				listToUpdate.push(relationId);

				delete existingEntity._id;
				var relationRevisionId = Provenance.insert(existingEntity);
				Provenance.update(relationRevisionId, {$set: newEntity});

				// Add a corresponding revision provenance /////////////////////////////
				var relationRevisionActivity = {
					provClasses:['Derivation'],
					mrReason: 'Media Relative Update',
					provAtTime : now,
					provWasStartedBy: userProv._id,
					provWasDerivedFrom: {
						provGenerated: relationRevisionId, 
						provDerivedFrom: existingId, 
						provAttributes: [{provType: 'provRevision'}]
					}
				};

				Provenance.insert(relationRevisionActivity);
				return relationRevisionId;

			} else {
				// Insert a new relative entry as there isnt's a record for the media in question (the source media or target media)
				var relativeEntry = {
					provClasses: ['Entity'],
					provType: 'MR: Media Relative',
					provGeneratedAtTime: now,
					mrTarget: {},
					mrSource: {}
				};

				if(isSource) {
					relativeEntry.mrMedia = provAttributes.source;
					relativeEntry.mrTarget[provAttributes.target] = [relationId];
				} else {
					relativeEntry.mrMedia = provAttributes.target;
					relativeEntry.mrSource[provAttributes.source] = [relationId];
				}
				
				var relativeId = Provenance.insert(relativeEntry);
				Provenance.update(relativeId, {$set: {mrOrigin: relativeId} });

				// Add a corresponding creation provenance activity ////////////////////
				var activity = {
					provClasses:['Activity'],
					provType:'MR: Media Relative Insertion',
					provStartedAtTime: now,
					provEndedAtTime: now,
					provWasStartedBy: userProv._id,
					provGenerated: relativeId
				};

				Provenance.insert(activity);

				// Insert the newly created media relatives entity to the main relations collection
				var collection = getRelationsList();
				var currentCollectionId = collection._id;
				delete collection._id;

				var revision = {
					provHadMember: collection.provHadMember,
					provGeneratedAtTime: now
				};
				var member = {
					mrMedia: relativeEntry.mrMedia,
					mrRelative: relativeId 
				};
				revision.provHadMember.push(member);

				var listRevisionId = Provenance.insert(collection);
				Provenance.update(listRevisionId, {$set: revision});

				// Add a corresponding revision provenance /////////////////////////////
				var listRevisionActivity = {
					provClasses:['Derivation'],
					mrReason: "Relations List Update",
					provAtTime : now,
					provWasStartedBy: userProv._id,
					provWasDerivedFrom: {
						provGenerated: listRevisionId, 
						provDerivedFrom: currentCollectionId, 
						provAttributes: [{provType: 'provRevision'}]
					}
				};

				Provenance.insert(listRevisionActivity);

				return relativeId;
			}
		}
	},
	relationRevisionAnnotation: function(provAttributes) {
		var user = Meteor.user();
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to annotate a relation");

		// TODO: ensure that the key and value are valid

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId: user._id});
		
		// Prepare the new information
		var newEntity = {
			mrAnnotation: {},
			provGeneratedAtTime: now
		};
		newEntity.mrAnnotation[provAttributes.annotationKey] = provAttributes.annotationValue;


		// Clone the latest version of the relation and update it
		var relation = getLatestRevision(provAttributes.currentRelationOrigin),
			currentRelationId = relation._id ;
		delete relation._id;

		var revisionId = Provenance.insert(relation);
		Provenance.update(revisionId, {$set: newEntity });      
					
		// Add a corresponding revision provenance /////////////////////////////
		var revisionActivity = {
			provClasses:['Derivation'],
			mrReason: 'Relation Annotation Update',
			provAtTime : now,
			provWasStartedBy: userProv._id,
			provWasDerivedFrom: {
				provGenerated: revisionId, 
				provDerivedFrom: currentRelationId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		};

		Provenance.insert(revisionActivity);

		return revisionId;
	},
	crisisReportMap: function(provAttributes) {
		var user = Meteor.user();
		
		// Validate input ////////////////////////////////////////////////////////
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add a new media");

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId:user._id});

		// Insert new map entity ///////////////////////////////////////////////
		// Extend the whitelisted attributes
		var map = {
			provClasses: ['Entity'],
			provType: 'Collection',
			mrCollectionType: 'Map',
			provGeneratedAtTime: now,
			mrAttribute: {},
			provHadMember: []
		};
		var mapId = Provenance.insert(map);
		Provenance.update(mapId, {$set: {mrOrigin: mapId}});

		// Add a corresponding creation provenance activity ////////////////////
		var mapActivity = {
			provClasses:['Activity'],
			provType:'MR: Map Insertion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: mapId
		};

		Provenance.insert(mapActivity);

		// Prepare entity that defines map and 
		// its attributes **relative** to the report, i.e. position, dimensions
		var mapAttribute = {
			provClasses: ['Entity'],
			provType: 'MR: Map Properties',
			provGeneratedAtTime: now,
			mrAttribute: {}
		}; 

		var mapAttributeId = Provenance.insert(mapAttribute);
		Provenance.update(mapAttributeId, {$set: {mrOrigin: mapAttributeId}});

		// Add a corresponding creation provenance activity ////////////////////
		var attrActivity = {
			provClasses:['Activity'],
			provType:'MR: Map Attribute Insertion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: mapAttributeId
		};
		
		Provenance.insert(attrActivity);

		// Prepare new revision of the report before inserting the mediaAttribute entity
		var revisionId = reportRevision(provAttributes),
			entity = { 
				mrMedia: mapId,
				mrAttribute: mapAttributeId
			};

		Provenance.update(revisionId, 
			{ $push: {provHadMember: entity} } 
		);

		return mapId;
	},
	'addMapMarker': function(provAttributes) {
		var user = Meteor.user();
		
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add a new media");
		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId:user._id});

		var marker = {
			provClasses: ['Entity'],
			provType: 'MR: Marker',
			provGeneratedAtTime: now,
			mrLatLng: provAttributes.mrLatLng
		};

		var markerId = Provenance.insert(marker);
		Provenance.update(markerId, {$set: {mrOrigin: markerId}});

		// Add a corresponding creation provenance activity ////////////////////
		var activity = {
			provClasses:['Activity'],
			provType:'MR: Marker Insertion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: markerId
		};

		Provenance.insert(activity);

		// Update the map with new marker
		var currentMap = getLatestRevision(provAttributes.currentMapOrigin),
			currentMapId = currentMap._id;


		delete currentMap._id;
		var mapRevisionId = Provenance.insert(currentMap);

		Provenance.update(mapRevisionId, 
			{ 
				$set: {provGeneratedAtTime: now},
			 	$push: {provHadMember: markerId} 
			}
		);

		// Add a corresponding revision provenance /////////////////////////////
		var revisionActivity = {
			provClasses:['Derivation'],
			mrReason: provAttributes.reason,
			provAtTime : now,
			provWasStartedBy: userProv._id,
			provWasDerivedFrom: {
				provGenerated: mapRevisionId, 
				provDerivedFrom: currentMapId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		};

		Provenance.insert(revisionActivity);
		return markerId;
	}

});


function reportRevision(provAttributes) {
		// Invalidate the record, rather than deleting it  
		var user = Meteor.user();

		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to revise a crisis");

		var currentCrisisId = provAttributes.currentCrisisId;

		// ensure the currentCrisisId has been set
		if (!currentCrisisId)
			throw new Meteor.Error(422, 'Please include the currentCrisisId');

		// ensure the crisis has a dctermsTitle
		if (!provAttributes.dctermsTitle)
			throw new Meteor.Error(422, 'Please fill in the title');

		// ensure the crisis has a dctermsDescription
		if (!provAttributes.dctermsDescription)
			throw new Meteor.Error(422, 'Please fill in the description');

		var now = new Date().getTime(); 
		var currentUser = Provenance.findOne({mrUserId: user._id});

		var crisisProperties = {
			dctermsTitle: provAttributes.dctermsTitle,
			dctermsDescription: provAttributes.dctermsDescription,
			provGeneratedAtTime: now
		};

		// Clone the current crisis record to retain the original provenance details    
		var revisionId;
		Provenance.find(currentCrisisId, {$limit: 1}).forEach(function(crisis){
			delete crisis._id;
			revisionId = Provenance.insert(crisis);
			Provenance.update(revisionId, {$set: crisisProperties});
		});
					
		// Add a corresponding revision provenance /////////////////////////////
		var revisionActivity = {
			provClasses:['Derivation'],
			mrReason: provAttributes.reason,
			provAtTime : now,
			provWasStartedBy: currentUser._id,
			provWasDerivedFrom: {
				provGenerated: revisionId, 
				provDerivedFrom: currentCrisisId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		};

		Provenance.insert(revisionActivity);

		return revisionId;
}

