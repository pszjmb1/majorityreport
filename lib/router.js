/** 
 * Majority Report routing rules
 */

Router.configure({
  // Primary template for rendering application
  layoutTemplate: 'layout',
  // Wait on provenance subscription loading before rendering layout.
  waitOn: function() { 
    return Meteor.subscribe('provenance'); 
  }
});

Router.map(function() {
  this.route('crises', {path: '/'});
  this.route('crisisContainer', {
    path: '/crisis/:_id',
    // This could be used to render any preovenance record, so it may be appropriate to contstrain it in the future to just Crisis record data.
    data: function() { return Provenance.findOne(this.params._id); }
  });
});

// Trigger Iron Router's built-in loading hook to make show the loading template while we wait for provenance subscription to load data
Router.onBeforeAction('loading');