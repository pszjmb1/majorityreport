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
		{ sort: {provGeneratedAtTime: -1}}
	);
};

getRelationsList = function() {
	return Provenance.findOne(
		{mrCollectionType: 'Relations', wasInvalidatedBy: { $exists: false} }
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

getEntityType = function(entity) {
    if(entity) {
        var type = entity.mrCollectionType || entity.provType.replace('MR: ', '');
        return type.toLowerCase();
    }
}

getMediaFormat = function(dctermsFormat) {
    if(dctermsFormat) {
        var format = dctermsFormat.split('/')[0];
        return format.toLowerCase();
    }
}


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
			provType: 'MR: Entity Report Attributes',
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
	crisisReportText: function(provAttributes) {
		var user = Meteor.user(),
			existingText = Provenance.findOne({mrContent: provAttributes.mrContent});
		
		// Validate input ////////////////////////////////////////////////////////
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add a new media");

		// ensure the crisis has a mrContent
		if (!provAttributes.mrContent)
			throw new Meteor.Error(422, 'Please fill in the text');
			

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId:user._id}),
			textId;

		// Ensure text already exists in the current report
		if(existingText) {
			// Keep track of the existing text id in case text doesn't exist in the current report
			textId = existingText.mrOrigin;

			var report = getLatestRevision(provAttributes.currentCrisisOrigin);
			if( _.findWhere(report.provHadMember, {mrEntity: textId}) ) {
				throw new Meteor.Error(422, 'Media already exists in the current report', textId);
			}

		} else {
			// Insert new text entity ///////////////////////////////////////////////
			// Extend the whitelisted attributes
			var text = _.extend(_.pick(provAttributes, 'mrContent'), {
				provClasses: ['Entity'],
				provType: 'MR: Media',
				dctermsFormat: 'text/html',
				provGeneratedAtTime: now,
				mrAttribute: {}
			});
			
			textId = Provenance.insert(text);
			Provenance.update(textId, {$set: {mrOrigin: textId}});

			// Add a corresponding creation provenance activity ////////////////////
			var enterActivity = {
				provClasses:['Activity'],
				provType:'MR: Media Insertion',
				provStartedAtTime: now,
				provEndedAtTime: now,
				provWasStartedBy: userProv._id,
				provGenerated: textId
			};

			Provenance.insert(enterActivity);

			// TODO: Insert text into a global text provCollection
		}


		// Insert Media into the Report //////////////////////////////////////////
		// Prepare entity that defines textId and 
		// its attributes **relative** to the report, i.e. position, dimensions
		var entityAttribute = {
			provClasses: ['Entity'],
			provType: 'MR: Entity Report Attributes',
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
				mrEntity: textId,
				mrAttribute: entityAttributeId
			};

		Provenance.update(revisionId, 
			{ $push: {provHadMember: entity} } 
		);

		return textId;
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
			mrAttribute: {}
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

			// Update relatives if the source/target entry already exists
			// Otherwise, 
			// - insert a new relative entry to as there isn't an existing one for the source/target entity
			// - add the newly created entry to the Relations list
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

				var revisionEntry = _.extend(_.omit(existingEntity, '_id'), newEntity);
				var relationRevisionId = Provenance.insert(revisionEntry);

				// Add a corresponding revision provenance /////////////////////////////
				var relationRevisionActivity = {
					provClasses:['Derivation'],
					mrReason: 'Entity Relative Update',
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

				var revision = {
					provHadMember: collection.provHadMember,
					provGeneratedAtTime: now
				};
				var member = {
					mrEntity: relativeEntry.mrEntity,
					mrRelative: relativeId 
				};
				revision.provHadMember.push(member);

				collectionEntry = _.extend(_.omit(collection, '_id'), revision);
				var listRevisionId = Provenance.insert(collectionEntry);

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
	entityRevisionAttribute: function(provAttributes) {
		var user = Meteor.user();
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add a new attribute");

		// TODO: ensure that the key and value are valid

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId: user._id});
		


		// Clone the latest version of the entity and update it
		var currentEntity = getLatestRevision(provAttributes.currentEntityOrigin),
			currentEntityId = currentEntity._id;
		
		// Prepare the new information
		var newEntity = {
			mrAttribute: {},
			provGeneratedAtTime: now
		};


		// Indicate whether or not the entity can accept multiple attributes
        var singleAttributeEntities = ['relation'],
            entityType = getEntityType(currentEntity),
            multipleAttributes = (_.contains(singleAttributeEntities, entityType)) ? false : true;
        
		if(multipleAttributes) {
			var attributes = currentEntity.mrAttribute;
			if(!_.has(attributes, provAttributes.label)) { attributes[provAttributes.label] = []; }
			attributes[provAttributes.label].push(provAttributes.mrAttribute);

			newEntity.mrAttribute = attributes;
		} else {
			newEntity.mrAttribute[provAttributes.attributeKey] = [provAttributes.attributeValue];
		}

		var entityEntry = _.extend(_.omit(currentEntity, '_id'), newEntity);
		var revisionId = Provenance.insert(entityEntry);   
				
		// Add a corresponding revision provenance /////////////////////////////
		var revisionActivity = {
			provClasses:['Derivation'],
			mrReason: 'Entity Attribute Update',
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
			mrAttribute: _.omit(existingAttrs, provAttributes.attrKey),
			provGeneratedAtTime: now
		};

		var entityEntry = _.extend(_.omit(entity, '_id'), newEntity);
		var revisionId = Provenance.insert(entityEntry);

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
	/**
	 * Update entities' attribute relative to report (i.e. position, dimension etc..)
	 */
	entityReportAttributeRevision: function(provAttributes) {
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
		
		var attributeEntry = _.extend(_.omit(attribute, '_id'), newAttribute);

		var revisionId = Provenance.insert(attributeEntry);
				
		// Add a corresponding revision provenance /////////////////////////////
		var revisionActivity = {
			provClasses:['Derivation'],
			mrReason: 'Entity Report Attribute Update',
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
			provType: 'MR: Entity Report Attributes',
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

		Provenance.update(revisionId, { $push: {provHadMember: entity} } );

		return mapId;
	},
	crisisMapMarker: function(provAttributes) {
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

		var revisedMap = {
			provGeneratedAtTime: now, 
			provHadMember: currentMap.provHadMember
		};
		revisedMap.provHadMember.push(markerId);
		
		var mapEntry = _.extend(_.omit(currentMap, '_id'), revisedMap);
		var mapRevisionId = Provenance.insert(mapEntry);

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
	},
	crisisReportTimeline: function(provAttributes) {
		var user = Meteor.user();
		
		// Validate input ////////////////////////////////////////////////////////
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add a new media");

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId:user._id});
			
		// Insert new timeline entity ///////////////////////////////////////////////
		var timeline = {
			provClasses: ['Entity'],
			provType: 'Collection',
			mrCollectionType: 'Timeline',
			provGeneratedAtTime: now,
			mrAttribute: {},
			provHadMember: []
		};
		var timelineId = Provenance.insert(timeline);
		Provenance.update(timelineId, {$set: {mrOrigin: timelineId}});

		// Add a corresponding creation provenance activity ////////////////////
		var timelineActivity = {
			provClasses:['Activity'],
			provType:'MR: Timeline Insertion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: timelineId
		};

		Provenance.insert(timelineActivity);

		// Prepare entity that defines timeline and 
		// its attributes **relative** to the report, i.e. position, dimensions
		var timelineAttribute = {
			provClasses: ['Entity'],
			provType: 'MR: Entity Report Attributes',
			provGeneratedAtTime: now,
			mrAttribute: {}
		}; 

		var timelineAttributeId = Provenance.insert(timelineAttribute);
		Provenance.update(timelineAttributeId, {$set: {mrOrigin: timelineAttributeId}});

		// Add a corresponding creation provenance activity ////////////////////
		var attrActivity = {
			provClasses:['Activity'],
			provType:'MR: Timeline Attribute Insertion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: timelineAttributeId
		};
		
		Provenance.insert(attrActivity);

		// Prepare new revision of the report before inserting the mediaAttribute entity
		var revisionId = reportRevision(provAttributes),
			entity = { 
				mrEntity: timelineId,
				mrAttribute: timelineAttributeId
			};

		Provenance.update(revisionId, { $push: {provHadMember: entity} } );

		return timelineId;
	},
	crisisTimelineEvent: function(provAttributes) {
		var user = Meteor.user();
		
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add a new timeline");
		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId:user._id});

		var eventEntity = _.extend(_.pick(provAttributes, 'dctermsTitle', 'mrStartDate', 'mrEndDate'), {
			provClasses: ['Entity'],
			provType: 'MR: Event',
			provGeneratedAtTime: now,
			mrAttribute: {}
		});

		var eventId = Provenance.insert(eventEntity);
		Provenance.update(eventId, {$set: {mrOrigin: eventId}});

		// Add a corresponding creation provenance activity ////////////////////
		var activity = {
			provClasses:['Activity'],
			provType:'MR: Event Insertion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: eventId
		};

		Provenance.insert(activity);

		// Update the map with new event
		var currentTimeline = getLatestRevision(provAttributes.currentTimelineOrigin),
			currentTimelineId = currentTimeline._id;

		var revisedTimeline = {
			provGeneratedAtTime: now, 
			provHadMember: currentTimeline.provHadMember
		};
		revisedTimeline.provHadMember.push(eventId);
		
		var timelineEntry = _.extend(_.omit(currentTimeline, '_id'), revisedTimeline);
		var timelineRevisionId = Provenance.insert(timelineEntry);

		// Add a corresponding revision provenance /////////////////////////////
		var revisionActivity = {
			provClasses:['Derivation'],
			mrReason: provAttributes.reason,
			provAtTime : now,
			provWasStartedBy: userProv._id,
			provWasDerivedFrom: {
				provGenerated: timelineRevisionId, 
				provDerivedFrom: currentTimelineId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		};

		Provenance.insert(revisionActivity);

		//Invalidate the previous version
		Provenance.update(currentTimelineId, {$set: {wasInvalidatedBy: revisionActivity}});

		return eventId;
	},
	crisisTimelineEventRevision: function(provAttributes) {
		var user = Meteor.user();
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to update event");

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId: user._id});

		// Clone the latest version of the entity and update it
		var eventEntity = getLatestRevision(provAttributes.currentEventOrigin),
			currentEventEntityId = eventEntity._id;
		
		// Prepare the new information
		var newEventEntity = _.extend(
			_.pick(provAttributes, 'dctermsTitle', 'mrStartDate', 'mrEndDate'), 
			{ provGeneratedAtTime: now }
		);

		var eventEntityEntry = _.extend(_.omit(eventEntity, '_id'), newEventEntity);
		var revisionId = Provenance.insert(eventEntityEntry);   
				
		// Add a corresponding revision provenance /////////////////////////////
		var revisionActivity = {
			provClasses:['Derivation'],
			mrReason: 'Event Details Update',
			provAtTime : now,
			provWasStartedBy: userProv._id,
			provWasDerivedFrom: {
				provGenerated: revisionId, 
				provDerivedFrom: currentEventEntityId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		};

		Provenance.insert(revisionActivity);

		//Invalidate the previous version
		Provenance.update(currentEventEntityId, {$set: {wasInvalidatedBy: revisionActivity}});

		return revisionId;
	},
	validateAssertion: function(provAttributes) {
		var user = Meteor.user();
		
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to validate an attribute");

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId:user._id});

		// Clone the latest version of the entity and update it
		var currentEntity = getLatestRevision(provAttributes.currentEntityOrigin),
			currentEntityId = currentEntity._id,
			currentUserId = user._id;
		

		var attributes = currentEntity.mrAttribute;
		if(_.has(attributes, provAttributes.label)) {
			var values = _.pluck(attributes[provAttributes.label], 'mrValue');

			if(_.contains(values, provAttributes.value)) {
				var valueObj = _.findWhere(attributes[provAttributes.label], {mrValue: provAttributes.value});

				if(valueObj && valueObj.mrCertainity) {
					var existingValidators = valueObj.mrCertainity.mrAssertionVerifiedBy;
					if(!_.contains(existingValidators, currentUserId)) {
						existingValidators.push(currentUserId);
					}
				}
			}
		}

		// Prepare the new information
		var newEntity = {
			mrAttribute: attributes,
			provGeneratedAtTime: now
		};
		console.log('newEntity ' , newEntity);22

		var entityEntry = _.extend(_.omit(currentEntity, '_id'), newEntity);
		var revisionId = Provenance.insert(entityEntry);   

		// Add a corresponding creation provenance activity ////////////////////
		var activity = {
			provClasses:['Activity'],
			provType:'MR: Attribute Value Verification',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: currentUserId,
			provGenerated: revisionId
		};

		Provenance.insert(activity);
				
		// Add a corresponding revision provenance /////////////////////////////
		var revisionActivity = {
			provClasses:['Derivation'],
			mrReason: 'Entity Attribute Update',
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
		currentCrisisId = crisis._id,
		crisisEntry = _.extend(_.omit(crisis, '_id'), crisisProperties);

	var revisionId = Provenance.insert(crisisEntry);
	
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