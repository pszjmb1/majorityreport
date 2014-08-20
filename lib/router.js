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
      Meteor.subscribe('relationsList');
    },
    data: function() {
      return getLatestRevision(this.params._id); 
    },
    onBeforeAction: function() {
      if(this.data()) {

        // Track the entities and subentites (images, timeline, maps .. events, markers)
        var allEntities = [];
        // Subscribe to the entities and attribtues directly in the reports collection
        var entities = _.flatten(_.map(this.data().provHadMember, function(member) {
          // Get the members including their postional/dimensional attributes
          return _.values(member);
        }));

        this.subscribe('entitiesAndReportAttributes', entities).wait();
        allEntities = _.union(allEntities, entities);

        // Subscribe to the sub entities and attribtues of the primary report entities
        var wrapperEntities = Provenance.find({mrCollectionType: {$in: ['Map', 'Timeline']}}).fetch();
        if(wrapperEntities) {
          var subentities = _.flatten(_.pluck(wrapperEntities, 'provHadMember'));
          this.subscribe('entitiesAndReportAttributes', subentities).wait();

          allEntities = _.union(allEntities, subentities);
        }
        
        // Subscribe to all the relations of the entities involved
        var renderedEntities = Session.get('renderedEntities');
        var relationsList  = getRelationsList();
        if(relationsList && relationsList.provHadMember) {
          var members = _.filter(relationsList.provHadMember, function(member) {
              return _.contains(allEntities, member.mrEntity);
          });
          var relativeOrigins = _.pluck(members, 'mrRelative');
          this.subscribe('relatives', relativeOrigins).wait();
        }

        var relatives = Provenance.find({provType: 'MR: Entity Relative'}).fetch();
        if(relatives) {
          var relatedEntities= [];
          var relationOrigins = _.unique(_.flatten(_.map(relatives, function(rel) {
            // only get the relations for entities present at the moment
            var keys = _.unique(_.flatten([_.keys(rel.mrSource), _.keys(rel.mrTarget)]));

            if(keys.length > 0) {
              // save the related entities
              relatedEntities = _.union(relatedEntities, keys);
              // Gather the targets and sources
              var sources = _.values(_.pick(rel.mrSource, keys)),
                targets = _.values(_.pick(rel.mrTarget, keys));
              return [sources, targets];
            }
          })));

          if(relationOrigins) {
            this.subscribe('relations', relationOrigins).wait();
          }

          if(relatedEntities) {
            // Subscribe to attributes that are related to the entities
            // -e.g ImageX has attribute of 'photographer: Juan'
            this.subscribe('relatedAttributes', relatedEntities);
          }

        } 
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