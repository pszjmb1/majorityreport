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

      var reports = Provenance.find({mrCollectionType: 'Crisis Report'}, {mrOrigin: 1}).fetch();
      if(reports) {
        Meteor.subscribe('activities', _.pluck(reports, 'mrOrigin'));
      }
    }
  });
  
  this.route('crisisContainer', {
    path: '/crisis/:_id',
    waitOn: function() {
      console.log("s");
      return Meteor.subscribe('report', this.params._id);
    },
    data: function() { 
      console.log("sd");
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