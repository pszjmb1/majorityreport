/**
 * Majority Report server publication rules
 */

Meteor.publish('provenance', function() {
  return Provenance.find();
});

Meteor.publish('reports', getReports);

Meteor.publish('agents', function() {
    return Provenance.find({provClasses: 'Agent'});
});

Meteor.publish('activities', function(origins) {
    if(!origins || _.isEmpty(origins)) { return; }
    return Provenance.find( {provClasses: "Activity", provGenerated: {$in: _.unique(origins)}} );
});


Meteor.publish('report', function(origin) {
    if(!origin) { return; }

    return Provenance.find( 
        { mrOrigin: origin, mrCollectionType: 'Crisis Report',  wasInvalidatedBy: { $exists: false} }, 
        { sort: { provGeneratedAtTime: -1 }, limit: 1}
    );
});

