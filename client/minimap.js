/**
 * Mini map - jquery plugin
 * Based on the work by Nathaniel Taintor and Brian Wald for Janrain
 * (https://github.com/goldenapples/jquery.minimap)
 */

YoMiniMap = MiniMap;
function MiniMap() {
	this.containerId = 'crisis-workspace';
	this.miniMapWrapperId = 'mini-map-wrapper';
	this.miniMapWrapperInnerClass = 'mini-map-wrapper-inner';
	
	this.viewAreaClass = 'view-area';
	this.width = 200;
	this.height = 200;

	this.initialised = false;

	this.mapWrapper = this.mapWrapperInner = this.container = this.mapBox = this.viewArea = null;

	return this;
}

MiniMap.prototype.init = function() {
	if(this.initialised) return; 

	var self = this;

	self.container = document.getElementById(self.containerId);
	self.mapWrapper = document.getElementById(self.miniMapWrapperId);

	self.viewArea = document.createElement('div');
	self.viewArea.className = self.viewAreaClass;


	self.mapWrapper.style.width = self.width +'px';
	self.mapWrapper.style.height = self.height +'px';
	self.mapWrapper.appendChild(self.viewArea);

	self.mapWrapperInner = document.createElement('div');
	self.mapWrapperInner.className = self.miniMapWrapperInnerClass;
	self.mapWrapper.appendChild(self.mapWrapperInner);

	self.initialised = true;

};

MiniMap.prototype.drawMap = function() {
	this.init();

	var self = this,
		containerRect = self.container.getBoundingClientRect(),
		mapWrapperRect = self.mapWrapper.getBoundingClientRect(),
		scale = Math.min(
				(mapWrapperRect.width / containerRect.width),
				(mapWrapperRect.height / containerRect.height)
			);

	if(self.mapBox !== null) { self.mapWrapperInner.removeChild(self.mapBox); }
	
	self.mapBox = self.container.cloneNode(true);

	var styles = {
		width: 					containerRect.width +'px',
		height: 				containerRect.height + 'px',
		position:               'absolute',
      	top:                    0,
      	left:                   0,
		'transform': 			{value: 'scale('+scale+')', autoPrefix: true},
		'transform-origin': 	{value: 'top left', autoPrefix: true},
	}

	self.mapBox.style.cssText += _generateCssText(styles);
	self.mapWrapperInner.appendChild(self.mapBox);
};


var _generateCssText = function(obj) {
	if(obj !== null && typeof obj === 'object') {
		var output = '';
		for( var prop in obj) {
			if(typeof obj[prop] === 'object' && obj[prop].hasOwnProperty('autoPrefix')) {
				var style = prop +':'+ obj[prop].value +';';
				output += style;
				output += '-webkit-'+ style;
				output += '-ms-'+ style;
				output += '-moz-'+ style;
			} else {
				output += prop +':'+ obj[prop] +';';
			}
		}

		return output;
	}
}


