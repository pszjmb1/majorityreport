Package.describe({
  summary: "jsPlumb provides a means for a developer to visually connect elements on their web pages."
});

Package.on_use(function (api, where) {
  api.use('jquery', 'client');
  api.add_files(['jquery.jsPlumb.js'], 'client');
});

Package.on_test(function (api) {
  api.use('jsPlumb');
});
