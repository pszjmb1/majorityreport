/**
 * Majority Report data fixtures for un-populated databases.
 */

if (Provenance.find().count() === 0) {
  var now = new Date().getTime();

  // Example User /////////////////////

  var jesseId = Meteor.users.insert({
    profile: { name: 'Jesse Blum' }
  });

  var jesse = Meteor.users.findOne(jesseId);

  var jesseProv = Provenance.insert({
    provClasses:['Agent', 'Person'],
    mrUserId: jesse._id,
    foafGivenName: 'Jesse',
    foafFamilyName: 'Blum',
    agencyBegan: now - 6 * 3600 * 1001,
  });

  var reportId = Provenance.insert({
    provClasses:['Entity'],
    provType:'Crisis Report',
    provGeneratedAtTime: now - 6 * 3600 * 1000,
    dctermsTitle: "The death of Ian Tomlinson",
    dctermsDescription: "An English newspaper vendor who collapsed and died in the City of London on his way home from work after being unlawfully struck by a police officer, Simon Harwood, during the 2009 G-20 summit protests."
  });

  Provenance.insert({
    provClasses:['Activity'],
    mrActivity:'Crisis Report Creation',
    provStartedAtTime: now - 6 * 3600 * 1000,
    provEndedAtTime: now - 6 * 3600 * 1000,
    provWasStartedBy: jesseProv,
    provGenerated: reportId
  });

  // Example Media Insertion ///////////

  var photographerProv = Provenance.insert({
    provClasses:['Agent', 'Person'],
    foafGivenName: 'Some Body'
  });

  var mediaProvId = Provenance.insert({
    provClasses:['Entity'],
    provType:'Media:Image',
    provAtLocation:'http://timestreams.org/wp-content/uploads/2013/12/CR_027316.jpg',
    dctermsTitle: "Once upon a time there was a man named Ian Tomlinson"
  });

  var contribId = Provenance.insert({
    provClasses:['Activity'],
    mrActivity:'contribute media',
    provAtTime: now - 6 * 3600 * 999,
    mrContributed: mediaProvId,
    provWasStartedBy: jesseProv
  });

  Provenance.insert({
    provClasses:['Activity'],
    mrActivity:'take photograph',
    provAtTime: now - 6 * 3600 * 4000,
    provGenerated: mediaProvId,
    provWasStartedBy: photographerProv,
    mrContributionActivity: contribId
  });
}