/**
 * Provenance - user connections
 */

/**
 * Creates a provenance record on user creation
 */ 
Accounts.onCreateUser(function(options, user) {
  var now = new Date().getTime();

  var jesseProv = Provenance.insert({
    provClasses:['Agent', 'Person'],
    mrUserId: user._id,
    agencyBegan: now
  });

  
  // We still want the default hook's 'profile' behavior.
  if (options.profile)
    user.profile = options.profile;
  return user;
});