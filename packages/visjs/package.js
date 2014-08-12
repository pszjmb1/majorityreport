Package.describe({
  summary: "vis.js - A dynamic, browser-based visualization library."
});

Package.on_use(function (api, where) {
  api.add_files([
  	'visjs/vis.js', // JS file
  	'visjs/vis.css',  // CSS file
  	// Network images
	"visjs/img/network/acceptDeleteIcon.png",
	"visjs/img/network/addNodeIcon.png",
	"visjs/img/network/backIcon.png",
	"visjs/img/network/connectIcon.png",
	"visjs/img/network/cross2.png",
	"visjs/img/network/cross.png",
	"visjs/img/network/deleteIcon.png",
	"visjs/img/network/downArrow.png",
	"visjs/img/network/editIcon.png",
	"visjs/img/network/leftArrow.png",
	"visjs/img/network/minus.png",
	"visjs/img/network/plus.png",
	"visjs/img/network/rightArrow.png",
	"visjs/img/network/upArrow.png",
	"visjs/img/network/zoomExtends.png",
	// Timeline images
	"visjs/img/timeline/delete.png"
  ], 'client');
});

Package.on_test(function (api) {
  api.use('visjs');
});


