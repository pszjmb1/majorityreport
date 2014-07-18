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
    }

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
    
    // Validate input ////////////////////////////////////////////////////////
    mediaWithSameUrl = Provenance.findOne({provAtLocation: provAttributes.mediaUrl});

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
      var activity = {
        provClasses:['Activity'],
        provType:'MR: Media Insertion',
        provStartedAtTime: now,
        provEndedAtTime: now,
        provWasStartedBy: userProv._id,
        provGenerated: mediaId
      }

      Provenance.insert(activity);

      // TODO: Insert media into a global media provCollection
    }


    // Insert Media into the Report //////////////////////////////////////////
    // Prepare entity that defines mediaId and 
    // its attributes relative to the report, i.e. position, dimensions
    var mediaAttribute = {
      provClasses: ['Entity'],
      provType: 'MR: Media Properties',
      provGeneratedAtTime: now,
      mrMedia: mediaId,
      mrAttribute: {}
    }
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
    }
    
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
  'mediaRevision': function (provAttributes) {
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
    }
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
  'mediaAttributeRemove': function (provAttributes) {
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
    }

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
  'mediaReportAttributeRevision': function(provAttributes) {
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

    revisionId = Provenance.insert(attribute);
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

