/**
 * Majority Report provenance collection
 */
Provenance = new Meteor.Collection('provenance');

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
      cldtermsItemType: 'Crisis Report'
    });

    // Insert the crisis
    var crisisId = Provenance.insert(crisis);
    
    // Assign an origin provenance ID to be able properly track related revisions, 
    // remains the same across related revisions
    Provenance.update(crisisId, {$set: {mrOriginProv: crisisId}});

    // Add a corresponding creation provenance activity ////////////////////

    var userProv = Provenance.findOne({mrUserId:user._id});
    var activity = {
      provClasses:['Activity'],
      mrActivity:'Crisis Report Creation',
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

    // ensure the user is logged in
    if (!user)
      throw new Meteor.Error(401, "Please login to remove a crisis");

    var currentCrisisId = provAttributes.currentCrisisId;

    // ensure the currentCrisisId has been set
    if (!currentCrisisId)
      throw new Meteor.Error(422, 'Please include the currentCrisisId');

    var now = new Date().getTime(); 
    var currentUser = Provenance.findOne({mrUserId: user});

    var removalActivity = Provenance.insert({
      provClasses:['Activity'],
      mrActivity:'Crisis Report Removal',
      provStartedAtTime: now,
      provEndedAtTime: now,
      provWasStartedBy: currentUser,
      provInvalidated:currentCrisisId
    });

    Provenance.update(currentCrisisId, {$set: {wasInvalidatedBy: removalActivity}});
  },
  crisisReportRevision: function (provAttributes) {
    reportRevision(provAttributes);
  }, 

  newMedia: function(provAttributes) {
    var user = Meteor.user(),
    
    // Validate input ////////////////////////////////////////////////////////
    mediaWithSameUrl = Provenance.findOne({mrMediaUrl: provAttributes.mrMediaUrl});

    // ensure the user is logged in
    if (!user)
      throw new Meteor.Error(401, "Please login to add a new media");

    // ensure the crisis has a mrMediaUrl
    if (!provAttributes.mrMediaUrl)
      throw new Meteor.Error(422, 'Please fill in the media URL');

    // ensure the crisis has a dctermsFormat
    if (!provAttributes.dctermsFormat)
      throw new Meteor.Error(422, 'Please select a media format');

    // check that there are no previous crises with the same title
    if (provAttributes.mrMediaUrl && mediaWithSameUrl) {
      throw new Meteor.Error(302, 
        'A media with the same URL already exists', 
        mediaWithSameUrl._id);
    }

    // Enter new media entity ///////////////////////////////////////////////
    var now = new Date().getTime();

    // Extend the whitelisted attributes
    var media = _.extend(_.pick(provAttributes, 'mrMediaUrl', 'dctermsFormat'), {
      provClasses: ['Entity'],
      provType: 'Media',
      provGeneratedAtTime: now
    });

    // Insert the media
    var mediaId = Provenance.insert(media);

    // Add a corresponding creation provenance activity ////////////////////
    var userProv = Provenance.findOne({mrUserId:user._id});
    var activity = {
      provClasses:['Activity'],
      mrActivity:'Media Insertion',
      provStartedAtTime: now,
      provEndedAtTime: now,
      provWasStartedBy: userProv._id,
      provGenerated: mediaId
    }

    Provenance.insert(activity);

    return mediaId;    

  },
  collectionReportMedia: function(provAttributes) {
    var record = {
      provHadMember: {
        provCollection: provAttributes.currentCrisisId,
        provEntity: provAttributes.mediaId,
        mrAttributes: []
      }
    }

    Provenance.insert(record);
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
    var revisedCrisisId;
    Provenance.find(currentCrisisId, {$limit: 1}).forEach(function(crisis){
      delete crisis._id;
      revisedCrisisId = Provenance.insert(crisis);
      Provenance.update(revisedCrisisId, {$set: crisisProperties});
    });
          
    // Add a corresponding revision provenance /////////////////////////////
    var revisionActivity = {
      provClasses:['Derivation'],
      mrReason: provAttributes.reason,
      provAtTime : now,
      provWasStartedBy: currentUser._id,
      provWasDerivedFrom: {
        provEntity: revisedCrisisId, 
        provDerivedFrom: currentCrisisId, 
        provAttributes: [{provType: 'provRevision'}]
      }
    };

    var revisionId = Provenance.insert(revisionActivity);

    return revisedCrisisId;
  }

