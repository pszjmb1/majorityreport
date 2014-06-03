/**
 * Provenance - user connections
 */

/**
 * Creates a provenance record on user creation
 */ 
Accounts.onCreateUser(function(options, user) {
  var now = new Date().getTime();

  Provenance.insert({
    provClasses:['Agent', 'Person'],
    mrUserId: user._id,
    mrUserName: user.username,
    agencyBegan: now
  });

  
  // We still want the default hook's 'profile' behavior.
  if (options.profile)
    user.profile = options.profile;
  return user;
});