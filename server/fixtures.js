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
    provType:'Collection',
    provGeneratedAtTime: now - 6 * 3600 * 1000,
    dctermsTitle: "The death of Ian Tomlinson",
    dctermsDescription: "An English newspaper vendor who collapsed and died in the City of London on his way home from work after being unlawfully struck by a police officer, Simon Harwood, during the 2009 G-20 summit protests.",
    mrCollectionType: 'Crisis Report',
    provHadMember: []
  });

  Provenance.update(reportId, {$set: {mrOrigin: reportId}});

  Provenance.insert({
    provClasses:['Activity'],
    mrActivity:'Crisis Report Creation',
    provStartedAtTime: now - 6 * 3600 * 1000,
    provEndedAtTime: now - 6 * 3600 * 1000,
    provWasStartedBy: jesseProv,
    provGenerated: reportId
  });

  // Insert Media Items
  // Insert Media Attributes
  // Insert Relationships

}