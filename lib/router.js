/** 
 * Majority Report routing rules
 */
Router.configure({
  // Primary template for rendering application
  layoutTemplate: 'layout',
  waitOn: function() { 
    // return Meteor.subscribe('provenance'); 
    Meteor.subscribe('userAgents');
  }
});

Router.map(function() {
  this.route('crises', {
    path: '/',
    waitOn: function() {
      Meteor.subscribe('reports');
      var reports = Provenance.find({mrCollectionType: 'Crisis Report'}).fetch();
      if(reports) {
        Meteor.subscribe('activities', _.pluck(reports, 'mrOrigin'));
      }
    }
  });

  this.route('crisisContainer', {
    path: '/crisis/:_id',
    waitOn: function() {
      Meteor.subscribe('report', this.params._id);
      Meteor.subscribe('activity', this.params._id);
    },
    data: function() {
      return getLatestRevision(this.params._id); 
    },
    onBeforeAction: function() {
      if(this.data()) {
        // For keeping track of all entities involved with the report
        var allEntities = [], entities = [], subentities = [];

        // Subscribe to the entities and attribtues directly in the reports collection
        entities = _.flatten(_.map(this.data().provHadMember, function(member) {
          return _.values(member);
        }));

        this.subscribe('entitiesAndAttributes', entities).wait();

        // Subscribe to the sub entities and attribtues of the primary report entities
        var wrapperEntities = Provenance.find({mrCollectionType: 'Map'}).fetch();
        if(wrapperEntities) {
          subentities = _.flatten(_.pluck(wrapperEntities, 'provHadMember'));
          this.subscribe('entitiesAndAttributes', subentities).wait();
        }
        
        // Subscribe to all the relations of the entities involved
        allEntities = _.union(entities, subentities);
        this.subscribe('relations', allEntities);
      }
    }
  });

  this.route(
    'newCrisis', { path: '/new' }
  );

  this.route('editCrisis', {    
    path: '/crisis/:_id/edit',
    waitOn: function() {
      return Meteor.subscribe('report', this.params._id);
    },
    data: function() { return getLatestRevision(this.params._id); }
  });
});

// Preventing logged out users from seeing the new crisis form
var requireLogin = function(pause) {
  if (! Meteor.user()) {
    if (Meteor.loggingIn())      
      this.render(this.loadingTemplate);    
    else      
      this.render('accessDenied');    
    pause();
  }
};

// Trigger Iron Router's built-in loading hook to make show the loading template while we wait for provenance subscription to load data
Router.onBeforeAction('loading');

Router.onBeforeAction(requireLogin, {only: 'newCrisis'});