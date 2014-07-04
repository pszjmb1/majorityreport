/**
 * Majority Report server publication rules
 */

Meteor.publish('provenance', function() {
  return Provenance.find();
});