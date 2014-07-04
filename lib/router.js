/** 
 * Majority Report routing rules
 */

var getLatestRevision = function(originId) {
  // Ensure we get the latest revision of any given report.
  return _.first(
    );
};

Router.configure({
  // Primary template for rendering application
  layoutTemplate: 'layout'
});

Router.map(function() {
  this.route('crises', {
    path: '/',
    waitOn: function() { 
      return Meteor.subscribe('provenance'); 
    }
  });
  this.route('crisisContainer', {
    path: '/crisis/:_id',
     // Wait on provenance subscription loading before rendering layout.
    waitOn: function() { 
      return Meteor.subscribe('reportRevisions', this.params._id); 
    },
    data: function() { return _.first(Provenance.find().fetch()); },
    onBeforeAction: function() {
      // Get the revisions to extract ids to subsribe to relations between Revisions and Media
      var revisions = Provenance.find({}).fetch();
      if(revisions) {
        var revisionIds = _(revisions).map(function(rev) { return rev._id; });
        // subsribe to the relations, these contain the attributes of media per revision
        this.subscribe('revisionAndMedia', revisionIds).wait();
      }
      
      // Get the relations to extract ids of the involved media in the report
      var relations = Provenance.find({'provHadMember': {$exists: true}}).fetch();
      if(relations) {
        var mediaIds = _(relations).map(function(item) { return item.provHadMember.provEntity; });
        // Subscribe to the required set of media
        this.subscribe('media', mediaIds).wait(); 
      }

      // Subscribe to Agents and the report Creation Activity -to be able to display the author detail
      this.subscribe('agents').wait();
      this.subscribe('reportActivity', this.params._id).wait();
    }
  });
  this.route(
    'newCrisis', { path: '/new' }
  );
  this.route('editCrisis', {    
    path: '/crisis/:_id/edit',
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
}

// Trigger Iron Router's built-in loading hook to make show the loading template while we wait for provenance subscription to load data
Router.onBeforeAction('loading');

Router.onBeforeAction(requireLogin, {only: 'newCrisis'});