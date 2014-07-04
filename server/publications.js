/**
 * Majority Report server publication rules
 */

Meteor.publish('provenance', function() {
  return Provenance.find();
});

Meteor.publish('agents', function() {
  return Provenance.find({ mrUserId: {$exists: true} });
});


Meteor.publish('reportActivity', function(reportId) {
  return Provenance.find({ provGenerated: reportId });
});

Meteor.publish('revisionAndMedia', function(revisionIds) {
	return Provenance.find({ 'provHadMember.provCollection': {$in: revisionIds} })
});

Meteor.publish('reportRevisions', function(reportId) {
	return Provenance.find( 
	  { provType: 'Collection', cldtermsItemType: 'Crisis Report', mrOriginProv: reportId }, 
	  { sort: { provGeneratedAtTime: -1 } } 
	);
});

Meteor.publish('media', function(mediaIds) {
	return Provenance.find({ _id: {$in: mediaIds} });
});