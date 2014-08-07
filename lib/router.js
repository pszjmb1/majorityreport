/** 
 * Majority Report routing rules
 */
Router.configure({
  // Primary template for rendering application
  layoutTemplate: 'layout',
  waitOn: function() { 
    // return Meteor.subscribe('provenance'); 
  }
});

Router.map(function() {
  this.route('crises', {
    path: '/',
    waitOn: function() {
      Meteor.subscribe('reports');
      Meteor.subscribe('agents');

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
      Meteor.subscribe('agents');

      var allEntities = [];
      var report = getLatestRevision(this.params._id);
      if(report) {
        var entities = _.flatten(_.map(report.provHadMember, function(member) {
          return _.values(member);
        }));

        Meteor.subscribe('entitiesAndAttributes', entities);

        allEntities = _.union(allEntities, entities);
      }

      var wrapperEntities = Provenance.find({mrCollectionType: 'Map'}).fetch();
      if(wrapperEntities) {
        var subentities = _.flatten(_.map(wrapperEntities.provHadMember, function(member) {
          return _.values(member);
        }));
        Meteor.subscribe('entitiesAndAttributes', subentities);

        allEntities = _.union(allEntities, subentities);
      }

      

    },
    data: function() {
      return getLatestRevision(this.params._id); 
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