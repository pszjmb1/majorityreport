/**
 * Majority Report server publication rules
 */

Meteor.publish('provenance', function() {
  return Provenance.find();
});

Meteor.publish('reports', getReports);

Meteor.publish('relationsList', function() {
    return Provenance.find(
        {mrCollectionType: 'Relations', wasInvalidatedBy: { $exists: false} }
    );
});

Meteor.publish('userAgents', function() {
    var agents = Provenance.find({provClasses: 'Agent'});
    var users = Meteor.users.find();

    return [ agents, users];
});

Meteor.publish('activities', function(origins) {
    if(!origins || _.isEmpty(origins)) { return; }
    return Provenance.find( {provClasses: "Activity", provGenerated: {$in: _.unique(origins)}} );
});

Meteor.publish('activity', function(origin) {
    if(!origin) { return; }
    return Provenance.find( {provClasses: "Activity", provGenerated: origin} );
});


Meteor.publish('report', function(origin) {
    if(!origin) { return; }

    return Provenance.find( 
        { mrOrigin: origin, mrCollectionType: 'Crisis Report',  wasInvalidatedBy: { $exists: false} }, 
        { sort: { provGeneratedAtTime: -1 }, limit: 1}
    );
});

Meteor.publish('entitiesAndReportAttributes', function(origins) {
    if(!origins || _.isEmpty(origins)) { return; }
    return Provenance.find(
        { provClasses: 'Entity', mrOrigin: {$in: _.unique(origins)}, wasInvalidatedBy: { $exists: false} },
        { sort: {provGeneratedAtTime: -1}}
    );
});

Meteor.publish('relatedAttributes', function(origins) {
    if(!origins || _.isEmpty(origins)) { return; }

    return Provenance.find(
        { 
            provType: 'MR: Attribute',
            mrOrigin: {$in: _.unique(origins)}, 
            mrLabel: { $exists: true},
            mrValue: { $exists: true},
            wasInvalidatedBy: { $exists: false}
        },
        { sort: {provGeneratedAtTime: -1}}
    );
});

Meteor.publish('relatives', function(origins) {
    if(!origins || _.isEmpty(origins)) { return; }

    return Provenance.find(
        {
            mrOrigin: {$in: origins}, 
            provType: 'MR: Entity Relative', 
            wasInvalidatedBy: { $exists: false} 
        },
        { sort: {provGeneratedAtTime: -1}}
    );

});


Meteor.publish('relations', function(origins) {
    if(!origins || _.isEmpty(origins)) { return; }

    return Provenance.find(
        {
            mrOrigin: {$in: origins}, 
            provType: 'MR: Relation', 
            wasInvalidatedBy: { $exists: false} 
        },
        { sort: {provGeneratedAtTime: -1}}
    );
    
});
