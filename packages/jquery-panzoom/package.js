Package.describe({
  summary: "jQuery Panzoom - A jQuery plugin for panning and zooming elements using CSS3"
});

Package.on_use(function (api, where) {
	api.use('jquery', 'client');
	api.add_files(['jquery.panzoom.js'], 'client');
});

Package.on_test(function (api) {
  api.use('jquery-panzoom');
});
