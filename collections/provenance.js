/**
 * Majority Report provenance collection
 */
Provenance = new Meteor.Collection('provenance');

getReports = function() {
	return Provenance.find(
        { mrCollectionType: 'Crisis Report',  wasInvalidatedBy: { $exists: false} },
        {sort: {provGeneratedAtTime: -1}}
    );
};

getLatestRevision = function(origin) {
	if(!origin) { return; }
	return Provenance.findOne( 
		{ mrOrigin: origin,  wasInvalidatedBy: { $exists: false} }, 
		{ sort: { provGeneratedAtTime: -1 }}
	);
};

getRelationsList = function() {
	return Provenance.findOne(
		{mrCollectionType: 'Relations'},
		{sort: {provGeneratedAtTime: -1}}
	);
};

getEntityRelative = function(entity) {
	var relative,
	rList = getRelationsList();

	if(rList && rList.provHadMember) {
		relative = _.findWhere(rList.provHadMember, {mrEntity: entity});
	
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
			mediaWithSameUrl = Provenance.findOne({provAtLocation: provAttributes.provAtLocation});
		
		// Validate input ////////////////////////////////////////////////////////
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add a new media");

		// ensure the crisis has a provAtLocation
		if (!provAttributes.provAtLocation)
			throw new Meteor.Error(422, 'Please fill in the media URL');

		// ensure the crisis has a dctermsFormat
		if (!provAttributes.dctermsFormat)
			throw new Meteor.Error(422, 'Please select a media format');

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId:user._id}),
			mediaId;

		// Ensure media doesn't already exists in the current report
		if(mediaWithSameUrl) {
			// Keep track of the existing media id in case media doesn't exist in the current report
			mediaId = mediaWithSameUrl.mrOrigin;

			var report = getLatestRevision(provAttributes.currentCrisisOrigin);
			if( _.findWhere(report.provHadMember, {mrEntity: mediaId}) ) {
				throw new Meteor.Error(422, 'Media already exists in the current report', mediaId);
			}

		} else {
			// Insert new media entity ///////////////////////////////////////////////
			// Extend the whitelisted attributes
			var media = _.extend(_.pick(provAttributes, 'dctermsFormat', 'provAtLocation'), {
				provClasses: ['Entity'],
				provType: 'MR: Media',
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
		var entityAttribute = {
			provClasses: ['Entity'],
			provType: 'MR: Media Report Attributes',
			provGeneratedAtTime: now,
			mrAttribute: {}
		}; 

		var entityAttributeId = Provenance.insert(entityAttribute);
		Provenance.update(entityAttributeId, {$set: {mrOrigin: entityAttributeId}});

		// Add a corresponding creation provenance activity ////////////////////
		var activity = {
			provClasses:['Activity'],
			provType:'MR: Media Report Attributes Insertion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: entityAttributeId
		};
		
		Provenance.insert(activity);

		// Prepare new revision of the report before inserting the entityAttribute entity
		var revisionId = reportRevision(provAttributes),
			entity = {
				mrEntity: mediaId,
				mrAttribute: entityAttributeId
			};

		Provenance.update(revisionId, 
			{ $push: {provHadMember: entity} } 
		);

		return mediaId;
	},
	entityAttribute: function (provAttributes) {
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
			userProv = Provenance.findOne({mrUserId:user._id});
			attribute = {};

		// Set up the new attributes as an object
		attribute[provAttributes.attrKey] = provAttributes.attrValue;
		
		// Get the exisiting attributes so that we can extend it with our new attribute before updating
		// Create a new revision
		var entity = getLatestRevision(provAttributes.currentEntityOrigin),
			currentEntityId = entity._id,
			existingAttrs = entity.mrAttribute;

		var newEntity = {
			mrAttribute: _(existingAttrs).extend(attribute),
			provGeneratedAtTime: now
		};

		delete entity._id;
		var revisionId = Provenance.insert(entity);
		Provenance.update(revisionId, {$set: newEntity});

		// Add an activity for inserting new attribute /////////////////////////
		var activity = {
			provClasses:['Activity'],
			provType: 'MR: Entity Attribute Insertion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: revisionId
		};

		Provenance.insert(activity);

		// Add a corresponding revision provenance /////////////////////////////
		var revisionActivity = {
			provClasses:['Derivation'],
			mrReason: 'Entity Update',
			provAtTime : now,
			provWasStartedBy: userProv._id,
			provWasDerivedFrom: {
				provGenerated: revisionId, 
				provDerivedFrom: currentEntityId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		};
		Provenance.insert(revisionActivity);

		//Invalidate the previous version
		Provenance.update(currentEntityId, {$set: {wasInvalidatedBy: revisionActivity}});

		return revisionId;
	},
	entityAttributeRemove: function (provAttributes) {
		var user = Meteor.user();

		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to remove the attribute");

		// ensure that the key of the attribute is entered
		if (!provAttributes.attrKey)
			throw new Meteor.Error(422, "Please select an appropriate attribute label");

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId:user._id});
			attribute = {};
		
		// Get the exisiting attributes so that we can extend it with our new attribute before updating
		// Insert a new revision
		var entity = getLatestRevision(provAttributes.currentEntityOrigin),
			currentEntityId = entity._id,
			existingAttrs = entity.mrAttribute;

		var newEntity = {
			// Remove the attribute key from the existing list/object
			mrAttribute: _(existingAttrs).omit(provAttributes.attrKey),
			provGeneratedAtTime: now
		};

		delete entity._id;
		var revisionId = Provenance.insert(entity);
		Provenance.update(revisionId, {$set: newEntity});

		// Add an activity for inserting new attribute /////////////////////////
		var activity = {
			provClasses:['Activity'],
			provType: 'MR: Entity Attribute Deletion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: revisionId
		};

		Provenance.insert(activity);
		// Add a corresponding revision provenance /////////////////////////////
		var revisionActivity = {
			provClasses:['Derivation'],
			mrReason: 'Entity Update',
			provAtTime : now,
			provWasStartedBy: userProv._id,
			provWasDerivedFrom: {
				provGenerated: revisionId, 
				provDerivedFrom: currentEntityId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		};

		Provenance.insert(revisionActivity);

		//Invalidate the previous version
		Provenance.update(currentEntityId, {$set: {wasInvalidatedBy: revisionActivity}});

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
		// Insert a new revision
		var attribute = getLatestRevision(provAttributes.currentAttributeOrigin),
			currentAttributeId = attribute._id;
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
				provDerivedFrom: currentAttributeId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		};

		Provenance.insert(revisionActivity);

		//Invalidate the previous version
		Provenance.update(currentAttributeId, {$set: {wasInvalidatedBy: revisionActivity}});

		return revisionId;
	},
	entityRelation: function(provAttributes) {
		var user = Meteor.user();
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add a new relation");

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId: user._id}),
			sourceRelation, 
			targetRelation;

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

		addEntityRelative(provAttributes, relationId, true);
		addEntityRelative(provAttributes, relationId, false);

		return relationId;

		// Keep log of the relations (as source and targets) per media items
		function addEntityRelative(provAttributes, relationId, isSource) {
			var now = new Date().getTime(),
			existingEntity = (isSource) ? getEntityRelative(provAttributes.source) : getEntityRelative(provAttributes.target);

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
				//Invalidate the previous version
				Provenance.update(existingId, {$set: {wasInvalidatedBy: relationRevisionActivity}});

				return relationRevisionId;

			} else {
				// Insert a new relative entry as there isnt's a record for the media in question (the source media or target media)
				var relativeEntry = {
					provClasses: ['Entity'],
					provType: 'MR: Entity Relative',
					provGeneratedAtTime: now,
					mrTarget: {},
					mrSource: {}
				};

				if(isSource) {
					relativeEntry.mrEntity = provAttributes.source;
					relativeEntry.mrTarget[provAttributes.target] = [relationId];
				} else {
					relativeEntry.mrEntity = provAttributes.target;
					relativeEntry.mrSource[provAttributes.source] = [relationId];
				}
				
				var relativeId = Provenance.insert(relativeEntry);
				Provenance.update(relativeId, {$set: {mrOrigin: relativeId} });

				// Add a corresponding creation provenance activity ////////////////////
				var activity = {
					provClasses:['Activity'],
					provType:'MR: Entity Relative Insertion',
					provStartedAtTime: now,
					provEndedAtTime: now,
					provWasStartedBy: userProv._id,
					provGenerated: relativeId
				};

				Provenance.insert(activity);

				// Insert the newly created media relatives entity to the main relations collection
				var collection = getRelationsList(),
					currentCollectionId = collection._id;

				delete collection._id;

				var revision = {
					provHadMember: collection.provHadMember,
					provGeneratedAtTime: now
				};
				var member = {
					mrEntity: relativeEntry.mrEntity,
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

				//Invalidate the previous version
				Provenance.update(currentCollectionId, {$set: {wasInvalidatedBy: listRevisionActivity}});

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

		//Invalidate the previous version
		Provenance.update(currentRelationId, {$set: {wasInvalidatedBy: revisionActivity}});

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
				mrEntity: mapId,
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
			mrLatLng: provAttributes.mrLatLng,
			mrAttribute: {}
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

		//Invalidate the previous version
		Provenance.update(currentMapId, {$set: {wasInvalidatedBy: revisionActivity}});

		return markerId;
	}

});


function reportRevision(provAttributes) {
	// Invalidate the record, rather than deleting it  
	var user = Meteor.user();

	// ensure the user is logged in
	if (!user)
		throw new Meteor.Error(401, "Please login to revise a crisis");

	// ensure the currentCrisisId has been set
	if (!provAttributes.currentCrisisId)
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
	var crisis = Provenance.findOne(provAttributes.currentCrisisId),
		currentCrisisId = crisis._id;

	delete crisis._id;
	var revisionId = Provenance.insert(crisis);
	Provenance.update(revisionId, {$set: crisisProperties});
			
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

	//Invalidate the previous version
	Provenance.update(currentCrisisId, {$set: {wasInvalidatedBy: revisionActivity}});

	return revisionId;
}

