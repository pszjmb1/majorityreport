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

getEntityType = function(entity, lowercase) {
    if(entity) {
    	lowercase = lowercase || true;
        var type = entity.mrCollectionType || entity.provType.replace('MR: ', '');
        type = (lowercase) ? type.toLowerCase() : type;
		return type;
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
		var user = Meteor.user(),
			currentCrisisId = provAttributes.currentCrisisId;

		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to remove a crisis");

		// ensure the currentCrisisId has been set
		if (!currentCrisisId)
			throw new Meteor.Error(422, 'Please include the currentCrisisId');

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId: user._id});

		var removalActivity = Provenance.insert({
			provClasses:['Activity'],
			provType:'MR: Crisis Report Removal',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provInvalidated: currentCrisisId
		});

		Provenance.update(currentCrisisId, {$set: {wasInvalidatedBy: removalActivity}});
	},
	crisisReportRevision: function (provAttributes) {
		var user = Meteor.user();

		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to revise a crisis");

		// ensure the currentCrisisId has been set
		if (!provAttributes.currentCrisisOrigin)
			throw new Meteor.Error(422, 'Please include the currentCrisis origin');

		// ensure the crisis has a dctermsTitle
		if (!provAttributes.dctermsTitle)
			throw new Meteor.Error(422, 'Please fill in the title');

		// ensure the crisis has a dctermsDescription
		if (!provAttributes.dctermsDescription)
			throw new Meteor.Error(422, 'Please fill in the description');

		reportRevision(provAttributes);
	}, 
	crisisEntityRemove: function(provAttributes) {
		var user = Meteor.user(),
			mediaWithSameUrl = Provenance.findOne({provAtLocation: provAttributes.provAtLocation});
		
		// Validate input ////////////////////////////////////////////////////////
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to be able to modify the crisis report");

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId:user._id});

		if(provAttributes.currentCrisisOrigin) {
			var currentCrisis = getLatestRevision(provAttributes.currentCrisisOrigin);

			var reportRevisionId = reportRevision(provAttributes);

			var memberItem = _.findWhere(currentCrisis.provHadMember, {mrEntity: provAttributes.currentEntityOrigin});
			var filteredMemberList = _.without(currentCrisis.provHadMember, memberItem);
			// Update the revision with the filtered list.
			Provenance.update(reportRevisionId, { $set: {provHadMember: filteredMemberList} } );

			var removalActivity = Provenance.insert({
				provClasses:['Activity'],
				provType:'MR: Report Entity Removal',
				provStartedAtTime: now,
				provEndedAtTime: now,
				provWasStartedBy: userProv._id,
				provGenerated: reportRevisionId
			});

			if(memberItem.mrAttribute) {
				// In addition, remove the attributes of the entity related to the report (e.g. top, left width)
				var currentAttribute = getLatestRevision(memberItem.mrAttribute);
				Provenance.update(currentAttribute._id, {$set: {wasInvalidatedBy: removalActivity}});
			}

		} else if(provAttributes.currentMapOrigin || provAttributes.currentTimelineOrigin) { 
			// perform the following for parent entities e.g. media, timelines etc..
			var parentOrigin = provAttributes.currentMapOrigin || provAttributes.currentTimelineOrigin,
				parentEntity = getLatestRevision(parentOrigin);

			var revisedParentEntity = {
				provHadMember: _.without(parentEntity.provHadMember, provAttributes.currentEntityOrigin),
				provGeneratedAtTime: now
			};

			var revisionEntry = _.extend(_.omit(parentEntity, '_id'), revisedParentEntity);
			var parentRevisionId = Provenance.insert(revisionEntry);

			// Add a corresponding revision provenance /////////////////////////////
			var revisionActivity = Provenance.insert({
				provClasses:['Derivation'],
				provType: 'MR: '+ getEntityType(parentEntity, false) +' Entity Revision',
				provAtTime : now,
				provWasStartedBy: userProv._id,
				provWasDerivedFrom: {
					provGenerated: parentRevisionId, 
					provDerivedFrom: parentEntity._id, 
					provAttributes: [{provType: 'provRevision'}]
				}
			});

			var removalActivity = Provenance.insert({
				provClasses:['Activity'],
				provType:'MR: Entity Removal',
				provStartedAtTime: now,
				provEndedAtTime: now,
				provWasStartedBy: userProv._id,
				provGenerated: parentRevisionId
			});

			//Invalidate the previous versions
			var currentEntity = getLatestRevision(provAttributes.currentEntityOrigin);
			Provenance.update(currentEntity._id, {$set: {wasInvalidatedBy: removalActivity}});
			//Invalidate previous parent version
			Provenance.update(parentEntity._id, {$set: {wasInvalidatedBy: removalActivity}});
		}
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
			mrSource: provAttributes.mrSource,
			mrTarget: provAttributes.mrTarget,
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

		addEntityRelative(provAttributes, relationId);

		return relationId;
	},
	entityRelationInvalidate: function(provAttributes) {
		var user = Meteor.user();
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add a new relation");

		invalidateRelation(provAttributes);
	},
	entityRelatedAttributeAdd: function(provAttributes) {
		var user = Meteor.user();
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add a new attribute");
		if(!provAttributes.mrLabel || provAttributes.mrLabel === '') 
			throw new Meteor.Error(422, "Attribute label cannot be empty");
		if(!provAttributes.mrValue || provAttributes.mrValue === '') 
			throw new Meteor.Error(422, "Attribute value cannot be empty");

		// Clone the latest version of the entity and update it
		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId: user._id});	

		// insert the attribute entry
		var attribute = {
			provClasses: ['Entity'],
			provType: 'MR: Attribute', 
			mrLabel: provAttributes.mrLabel.toLowerCase(),
			mrValue: provAttributes.mrValue,
			provGeneratedAtTime: now
		};

		var attributeId = Provenance.insert(attribute);
		Provenance.update(attributeId, {$set: {mrOrigin: attributeId} }); 
		// Add a corresponding creation provenance activity ////////////////////
		var activity = {
			provClasses:['Activity'],
			provType:'MR: Attribute Insertion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: attributeId
		};

		// insert a new relation between the entity and the attribute/////////
		var sourceTarget = {
			mrSource: provAttributes.currentEntityOrigin,
			mrTarget: attributeId
		}; 

		var relation = {
			provClasses: ['Entity'],
			provType: 'MR: Relation', 
			mrSource: sourceTarget.mrSource,
			mrTarget: sourceTarget.mrTarget,
			mrAttribute: {
				mrCertainity: []
			},
			provGeneratedAtTime: now
		};

		if(provAttributes.mrCertainity) {
			// if the confidence range contains the same values, simply store a single value
			if(provAttributes.mrCertainity.upAssertionConfidence
				&& provAttributes.mrCertainity.upAssertionConfidence.length > 1) {
				if(provAttributes.mrCertainity.upAssertionConfidence[0] === provAttributes.mrCertainity.upAssertionConfidence[1]) {
					provAttributes.mrCertainity.upAssertionConfidence = [provAttributes.mrCertainity.upAssertionConfidence[0]];
				}
			}

			var certainity = _.extend(provAttributes.mrCertainity, {
				mrAssertionBy: userProv._id
			})
			relation.mrAttribute.mrCertainity.push(certainity);
		}
		
		var relationId = Provenance.insert(relation);
		Provenance.update(relationId, {$set: {mrOrigin: relationId} }); 
		// Add a corresponding creation provenance activity ////////////////////
		var activity = {
			provClasses:['Activity'],
			provType:'MR: Entity Attribute Relation Insertion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: relationId
		};


		// update the entity relatives
		addEntityRelative(sourceTarget, relationId);

		return attributeId;
	},
	entityRelatedAttributeUpdate: function(provAttributes) {
		var user = Meteor.user();
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add a new attribute");
		if(!provAttributes.mrLabel || provAttributes.mrLabel === '') 
			throw new Meteor.Error(422, "Attribute label cannot be empty");
		if(!provAttributes.mrValue || provAttributes.mrValue === '') 
			throw new Meteor.Error(422, "Attribute value cannot be empty");

		// Clone the latest version of the entity and update it
		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId: user._id}),
			currentAttribute = getLatestRevision(provAttributes.currentAttributeOrigin),
			currentAttributeId = currentAttribute._id;	

		// insert the attribute entry
		var newAttribute = {
			mrValue: provAttributes.mrValue,
			provGeneratedAtTime: now
		};

		var attributeEntry = _.extend(_.omit(currentAttribute, '_id'), newAttribute);
		var revisionId = Provenance.insert(attributeEntry); 
		
		// Add a corresponding revision provenance /////////////////////////////
		var revisionActivity = Provenance.insert({
			provClasses:['Derivation'],
			mrReason: 'Entity Update',
			provAtTime : now,
			provWasStartedBy: userProv._id,
			provWasDerivedFrom: {
				provGenerated: revisionId, 
				provDerivedFrom: currentAttributeId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		});

		// Invalidate previous version
		Provenance.update(currentAttributeId, {$set: {wasInvalidatedBy: revisionActivity}});

		return revisionId;
	},
	entityRelatedAttributeAgree: function(provAttributes) {
		var user = Meteor.user();
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to agree to an attribute value");

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId: user._id});

		// entityOrigin, attributeOrigin
		// get the relation between the entity and attribute
		var currentEntityOrigin = provAttributes.currentEntityOrigin,
			currentAttributeOrigin = provAttributes.currentAttributeOrigin,
			currentRelation = Provenance.findOne({
				provType: 'MR: Relation', 
				mrSource: currentEntityOrigin, 
				mrTarget: currentAttributeOrigin, 
				wasInvalidatedBy: {$exists: false}
			}),
			currentRelationId = currentRelation._id,
			existingCertainity = currentRelation.mrAttribute.mrCertainity,
			indexToInsert = 0;
		
			// check if current user has already agreed to the value
			// - if so, update the certainity
		if(existingCertainity && existingCertainity.length > 0) {
			var existingCertainityByUser = _.findWhere(existingCertainity, {mrAssertionBy: userProv._id});
			if(!_.isEmpty(existingCertainityByUser)) {
				indexToInsert = _.indexOf(existingCertainity, existingCertainityByUser);
			} else {
				indexToInsert = existingCertainity.length;
			}
		}

		var relationUpdate = {
			mrAttribute: currentRelation.mrAttribute,
			provGeneratedAtTime: now
		};
		// if the confidence range contains the same values, simply store a single value
		if(provAttributes.mrCertainity.upAssertionConfidence
			&& provAttributes.mrCertainity.upAssertionConfidence.length > 1) {
			if(provAttributes.mrCertainity.upAssertionConfidence[0] === provAttributes.mrCertainity.upAssertionConfidence[1]) {
				provAttributes.mrCertainity.upAssertionConfidence = [provAttributes.mrCertainity.upAssertionConfidence[0]];
			}
		}
		relationUpdate.mrAttribute.mrCertainity[indexToInsert] = _.extend(provAttributes.mrCertainity, {
			mrAssertionBy: userProv._id
		});

		// create new revision
		var relationEntry = _.extend(_.omit(currentRelation, '_id'), relationUpdate);
		var revisionId = Provenance.insert(relationEntry);
				
		// Add a corresponding revision provenance /////////////////////////////
		var revisionActivity = Provenance.insert({
			provClasses:['Derivation'],
			mrReason: 'Update Related Attribute Certainity',
			provAtTime : now,
			provWasStartedBy: userProv._id,
			provWasDerivedFrom: {
				provGenerated: revisionId, 
				provDerivedFrom: currentRelationId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		});

		//Invalidate the previous version
		Provenance.update(currentRelationId, {$set: {wasInvalidatedBy: revisionActivity}});

		return revisionId;
	},
	entityRelatedAttributeRemove: function (provAttributes) {
		var user = Meteor.user();

		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to remove the attribute");

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId:user._id});

		// Convert provAttributes to an array if only a single item is passed
		// -- this is to be able to process multiple attributes and single attribute
		provAttributes = (_.isArray(provAttributes)) ? provAttributes : [provAttributes];

		_.each(provAttributes, function(data) {
			var currentAttribute = getLatestRevision(data.currentAttributeOrigin);
			
			// Invalidate the attribute
			var removalActivity = Provenance.insert({
				provClasses:['Activity'],
				provType:'MR: Entities Attribute Removal',
				provStartedAtTime: now,
				provEndedAtTime: now,
				provWasStartedBy: userProv._id,
				provInvalidated: data.currentAttributeOrigin
			});

			Provenance.update(currentAttribute._id, {$set: {wasInvalidatedBy: removalActivity}});

			// Invalidate relation and maintain the relatives list
			var prov = {
				currentRelationOrigin: data.currentRelationOrigin,
				mrSource: data.currentEntityOrigin,
				mrTarget: data.currentAttributeOrigin,
			};

			invalidateRelation(prov);
		});
	},
	/**
	 * Update entities' attribute relative to report (i.e. position, dimension etc..)
	 */
	entityReportAttributeRevision: function(provAttributes) {
		var user = Meteor.user();
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to update the entity's attributes");

		var revisionId = updateEntityReportAttribute(provAttributes);

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
		var revisionActivity = Provenance.insert({
			provClasses:['Derivation'],
			mrReason: provAttributes.reason,
			provAtTime : now,
			provWasStartedBy: userProv._id,
			provWasDerivedFrom: {
				provGenerated: mapRevisionId, 
				provDerivedFrom: currentMapId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		});

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
		var revisionActivity = Provenance.insert({
			provClasses:['Derivation'],
			mrReason: provAttributes.reason,
			provAtTime : now,
			provWasStartedBy: userProv._id,
			provWasDerivedFrom: {
				provGenerated: timelineRevisionId, 
				provDerivedFrom: currentTimelineId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		});

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
		var revisionActivity = Provenance.insert({
			provClasses:['Derivation'],
			mrReason: 'Event Details Update',
			provAtTime : now,
			provWasStartedBy: userProv._id,
			provWasDerivedFrom: {
				provGenerated: revisionId, 
				provDerivedFrom: currentEventEntityId, 
				provAttributes: [{provType: 'provRevision'}]
			}
		});

		//Invalidate the previous version
		Provenance.update(currentEventEntityId, {$set: {wasInvalidatedBy: revisionActivity}});

		return revisionId;
	},
	crisisReportPanel: function(provAttributes) {
		var user = Meteor.user();
		
		// Validate input ////////////////////////////////////////////////////////
		// ensure the user is logged in
		if (!user)
			throw new Meteor.Error(401, "Please login to add a new media");

		var now = new Date().getTime(),
			userProv = Provenance.findOne({mrUserId:user._id});
		
		// - First insert the panel
		// - Move the children entities from report's member list to the new panel's member list
		// Insert new panel entity ///////////////////////////////////////////////
		var panel = {
			provClasses: ['Entity'],
			provType: 'Collection',
			mrCollectionType: 'Panel',
			provGeneratedAtTime: now,
			provHadMember: []
		};
		var panelId = Provenance.insert(panel);
		Provenance.update(panelId, {$set: {mrOrigin: panelId}});

		// Add a corresponding creation provenance activity ////////////////////
		var panelActivity = {
			provClasses:['Activity'],
			provType:'MR: Panel Insertion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: panelId
		};

		Provenance.insert(panelActivity);

		// Prepare entity that defines panel and 
		// its attributes **relative** to the report, i.e. position, dimensions
		var panelAttribute = {
			provClasses: ['Entity'],
			provType: 'MR: Entity Report Attributes',
			provGeneratedAtTime: now,
			mrAttribute: provAttributes.mrAttribute || {}
		}; 

		var panelAttributeId = Provenance.insert(panelAttribute);
		Provenance.update(panelAttributeId, {$set: {mrOrigin: panelAttributeId}});

		// Add a corresponding creation provenance activity ////////////////////
		var attrActivity = {
			provClasses:['Activity'],
			provType:'MR: Panel Attribute Insertion',
			provStartedAtTime: now,
			provEndedAtTime: now,
			provWasStartedBy: userProv._id,
			provGenerated: panelAttributeId
		};
		
		Provenance.insert(attrActivity);

		////////////////////////////////////////////////////////////////////////////////
		// Transfer the sub entities //////////////////////////////////////////////////
		var currentReport = getLatestRevision(provAttributes.currentCrisisOrigin),
			reportMembers = currentReport.provHadMember,
			childEntitiesOrigin = _.pluck(provAttributes.members, 'entityOrigin');

		// extract the children and attribute entry from the report's members list
		var childEntitiesMembership = _.filter(reportMembers, function(member) {
			return _.contains(childEntitiesOrigin, member.mrEntity);
		});

		// remove the children membership and insert the panel membership
		var updateReportMembers = _.difference(reportMembers, childEntitiesMembership);
		// // Prepare new revision of the report before inserting the panel entity
		var revisionId = reportRevision(_.pick(provAttributes, 'currentCrisisOrigin')),
			panelReportMembership = {
				mrEntity: panelId,
				mrAttribute: panelAttributeId
			};
		// Insert the panel to the report
		Provenance.update(revisionId, { $set: {provHadMember: [panelReportMembership]} } );
		// Insert the children to the panel 
		Provenance.update(panelId, { $set: {provHadMember: childEntitiesMembership} } );
		
		// Update the children entities' atrribute(position) relative to the new panel's properties
		_.each(childEntitiesMembership, function(member) {
			var passedAttribute = _.findWhere(provAttributes.members, {entityOrigin: member.mrEntity});
			var details = {
				currentAttributeOrigin: member.mrAttribute, // existing attribute origin
				mrAttribute: passedAttribute.mrAttribute
			};
			// update the attributes
			updateEntityReportAttribute(details);
		});

		return panelId;
	},
	

});


function reportRevision(provAttributes) {
	var now = new Date().getTime(),
		userProv = Provenance.findOne({mrUserId: Meteor.user()._id});

	provAttributes.provGeneratedAtTime = now;

	// Clone the current crisis record to retain the original provenance details    
	var currentCrisis = getLatestRevision(provAttributes.currentCrisisOrigin);
	var crisisEntry = _.extend(_.omit(currentCrisis, '_id'), provAttributes);

	var revisionId = Provenance.insert(crisisEntry);
	
	// Add a corresponding revision provenance /////////////////////////////
	var revisionActivity = Provenance.insert({
		provClasses:['Derivation'],
		mrReason: provAttributes.reason,
		provAtTime : now,
		provWasStartedBy: userProv._id,
		provWasDerivedFrom: {
			provGenerated: revisionId, 
			provDerivedFrom: currentCrisis._id, 
			provAttributes: [{provType: 'provRevision'}]
		}
	});

	//Invalidate the previous version
	Provenance.update(currentCrisis._id, {$set: {wasInvalidatedBy: revisionActivity}});

	return revisionId;
}

function updateEntityReportAttribute(provAttributes) {
	var now = new Date().getTime(),
		userProv = Provenance.findOne({mrUserId: Meteor.user()._id});


	// Clone the latest media attribute and update them
	// Insert a new revision
	var currentAttribute = getLatestRevision(provAttributes.currentAttributeOrigin);
	// Prepare the new information
	var newAttribute = _.extend(_.pick(provAttributes, 'mrAttribute'), {
		provGeneratedAtTime: now
	});

	var attributeEntry = _.extend(_.omit(currentAttribute, '_id'), newAttribute);

	var revisionId = Provenance.insert(attributeEntry);
			
	// Add a corresponding revision provenance /////////////////////////////
	var revisionActivity = Provenance.insert({
		provClasses:['Derivation'],
		mrReason: 'Entity Report Attribute Update',
		provAtTime : now,
		provWasStartedBy: userProv._id,
		provWasDerivedFrom: {
			provGenerated: revisionId, 
			provDerivedFrom: currentAttribute._id, 
			provAttributes: [{provType: 'provRevision'}]
		}
	});

	//Invalidate the previous version
	Provenance.update(currentAttribute._id, {$set: {wasInvalidatedBy: revisionActivity}});

	return revisionId;
}

// Keep log of the relations (as source and targets) per media items
function addEntityRelative(provAttributes, relationId) {
	var user = Meteor.user(),
		now = new Date().getTime(),
		userProv = Provenance.findOne({mrUserId: user._id});

	addRelative(true); // maintain relatives for **source** entity
	addRelative(false); // maintain relatives for **target** entity

	/**
	 * Function for handling (inserting or updating) entity relatives
	 * Update relatives if the source/target entry already exists
	 * Otherwise, 
	 * - insert a new relative entry to as there isn't an existing one for the source/target entity
	 * add the newly created entry to the Relations list
	 */	
	function addRelative(isSource) {
		var existingEntity = (isSource) ? getEntityRelative(provAttributes.mrSource) : getEntityRelative(provAttributes.mrTarget);
	
		if(existingEntity) {
			var listToUpdate,
				existingId = existingEntity._id,
				newEntity = { provGeneratedAtTime: now };

			// Prepare the entity to update depending on whether the current media is a source or target
			if(isSource) {
				// Prepare the new entity for source media
				newEntity.mrTarget = existingEntity.mrTarget;
				if(!newEntity.mrTarget[provAttributes.mrTarget]) {
					newEntity.mrTarget[provAttributes.mrTarget] = [];
				}
				listToUpdate = newEntity.mrTarget[provAttributes.mrTarget];
			} else {
				// Prepare the new entity for target media
				newEntity.mrSource = existingEntity.mrSource;
				if(!newEntity.mrSource[provAttributes.mrSource]) {
					newEntity.mrSource[provAttributes.mrSource] = [];
				}
				listToUpdate = newEntity.mrSource[provAttributes.mrSource];
			}

			listToUpdate.push(relationId);

			var revisionEntry = _.extend(_.omit(existingEntity, '_id'), newEntity);
			var relationRevisionId = Provenance.insert(revisionEntry);

			// Add a corresponding revision provenance /////////////////////////////
			var relationRevisionActivity = Provenance.insert({
				provClasses:['Derivation'],
				mrReason: 'Entity Relative Update',
				provAtTime : now,
				provWasStartedBy: userProv._id,
				provWasDerivedFrom: {
					provGenerated: relationRevisionId, 
					provDerivedFrom: existingId, 
					provAttributes: [{provType: 'provRevision'}]
				}
			});
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
				relativeEntry.mrEntity = provAttributes.mrSource;
				relativeEntry.mrTarget[provAttributes.mrTarget] = [relationId];
			} else {
				relativeEntry.mrEntity = provAttributes.mrTarget;
				relativeEntry.mrSource[provAttributes.mrSource] = [relationId];
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
			var listRevisionActivity = Provenance.insert({
				provClasses:['Derivation'],
				mrReason: "Relations List Update",
				provAtTime : now,
				provWasStartedBy: userProv._id,
				provWasDerivedFrom: {
					provGenerated: listRevisionId, 
					provDerivedFrom: currentCollectionId, 
					provAttributes: [{provType: 'provRevision'}]
				}
			});

			//Invalidate the previous version
			Provenance.update(currentCollectionId, {$set: {wasInvalidatedBy: listRevisionActivity}});

			return relativeId;
		}
	}
}

function invalidateRelation(provAttributes) {
	var now = new Date().getTime(),
		userProv = Provenance.findOne({mrUserId: Meteor.user()._id});
	// Invalidate the current relation
	var currentRelation = getLatestRevision(provAttributes.currentRelationOrigin);
	var removalActivity = Provenance.insert({
		provClasses:['Activity'],
		provType:'MR: Entities Relation Removal',
		provStartedAtTime: now,
		provEndedAtTime: now,
		provWasStartedBy: userProv._id,
		provInvalidated: provAttributes.currentRelationOrigin
	});

	Provenance.update(currentRelation._id, {$set: {wasInvalidatedBy: removalActivity}});

	// Remove relation from the source's relatives list//////////////////////////////////////
	var sourceRelative = getEntityRelative(provAttributes.mrSource);

	sourceRelative.mrTarget[provAttributes.mrTarget] = _.without(
		sourceRelative.mrTarget[provAttributes.mrTarget], 
		provAttributes.currentRelationOrigin
	);
	sourceRelative.provGeneratedAtTime = now;

	var revisionId = Provenance.insert(_.omit(sourceRelative, '_id'));
	// Add a corresponding revision provenance /////////////////////////////
	var relationRevisionActivity = Provenance.insert({
		provClasses:['Derivation'],
		mrReason: 'Entity Relative Update: Removal',
		provAtTime : now,
		provWasStartedBy: userProv._id,
		provWasDerivedFrom: {
			provGenerated: revisionId, 
			provDerivedFrom: sourceRelative._id, 
			provAttributes: [{provType: 'provRevision'}]
		}
	});

	Provenance.update(sourceRelative._id, {$set: {wasInvalidatedBy: relationRevisionActivity}});

	// Remove relation from the target's relatives list//////////////////////////////////////
	var targetRelative = getEntityRelative(provAttributes.mrTarget);
	if(targetRelative) {
		targetRelative.mrSource[provAttributes.mrSource] = _.without(
			targetRelative.mrSource[provAttributes.mrSource], 
			provAttributes.currentRelationOrigin
		);
		targetRelative.provGeneratedAtTime = now;

		var revisionId = Provenance.insert(_.omit(targetRelative, '_id'));
		// Add a corresponding revision provenance /////////////////////////////
		var relationRevisionActivity = Provenance.insert({
			provClasses:['Derivation'],
			mrReason: 'Entity Relative Update: Removal',
			provAtTime : now,
			provWasStartedBy: userProv._id,
			provWasDerivedFrom: {
				provGenerated: revisionId, 
				provDerivedFrom: targetRelative._id, 
				provAttributes: [{provType: 'provRevision'}]
			}
		});

		Provenance.update(targetRelative._id, {$set: {wasInvalidatedBy: relationRevisionActivity}});
	}
}