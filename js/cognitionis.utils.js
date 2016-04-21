"use strict";

var monthNames=[ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// USER DATA
var user_language=window.navigator.userLanguage || window.navigator.language;
var is_iOS = ( navigator.userAgent.match(/(iPad|iPhone|iPod)/g) ? true : false );
function is_cordova(){
	if( navigator.userAgent.match(/(i(os|phone|pod|pad|emobile)|android|blackberry)/i) &&
		 /^file:\/{3}[^\/]/i.test(window.location.href) ){
		return true;
	}
	return false;
}
function is_local(){
	if( /^file:\/{3}[^\/]/i.test(window.location.href) ){
		return true;
	}
	return false;
}

function check_internet_access_with_img_url(img_url, callback_true, callback_false,callback_arg){
    //return navigator.onLine; // unsafe
    var i = new Image();
    if(typeof(callback_arg)=='undefined'){i.onload = callback_true;i.onerror = callback_false;}
    else{
        i.onload = function () {callback_true(callback_arg);}.bind(callback_true,callback_arg);
        i.onerror = function () {callback_false(callback_arg);}.bind(callback_false,callback_arg);
    }    
    i.src = img_url+'?d=' + escape(Date()); // escape(Date()) to avoid cache
}


// Audio types. Best choice: m4a (mp4)
var html5_audiotypes={"mp3": "audio/mpeg","mp4": "audio/mp4","m4a": "audio/mp4",
					  "ogg": "audio/ogg","wav": "audio/wav" };

var JsonLazy={
    data: {},
    load: function(json_url, name, callback){
        if(typeof(json_url)=='undefined' || typeof(name)=='undefined'
            || typeof(callback)=='undefined')
            throw new Error('json_url, name or callback are not defined');
        ajax_request_json(json_url,function(json){
            JsonLazy.data[name]=json; //console.log(json)
            callback();
        });
    }
}



/*
* Load media
* lazy audio means that if some browsers do not load it inmediatly we let the load process finish when images are loaded
*
*/
var ResourceLoader={
	MEDIA_LOAD_TIMEOUT:15000, 		// 20 sec + (initial-interval, aprox 1 sec)
	media_load_time:0,			// load time counter
	media_load_check_status_interval:250, 	// check status every 0.25 sec
	media_load_check_status_initial_min_splash:1500,
	load_progressbar: undefined,
	load_interval: undefined,
	modal_load_window: undefined,
	modal_dialog: undefined,
	modal_dialog_msg: undefined,
	callback_on_load_end: undefined,
	num_images:0,
	num_sounds:0,
	not_loaded:{},
	ret_media:{},
	lazy_audio:false,
	download_lazy_audio_active : false,
	debug: false,
	
    
	load_json: function (resource_url){
        if(!JsonLazy.data.hasOwnProperty(get_resource_name(resource_url))){
            JsonLazy.load(resource_url, get_resource_name(resource_url), function(){ResourceLoader.log_and_remove_from_not_loaded('load','jsons',resource_url);});
        }
	},
	load_image: function (resource_url){
		ResourceLoader.ret_media.images[get_resource_name(resource_url)]=new Image();
		ResourceLoader.ret_media.images[get_resource_name(resource_url)].addEventListener("load", ResourceLoader.log_and_remove_from_not_loaded('load','images',resource_url));
		ResourceLoader.ret_media.images[get_resource_name(resource_url)].src = resource_url; // after? load begins as soon as src is set..
		//return image_object; // not good for async stuff
	},
	load_sound: function (resource_url){
		//var audio_object=new Audio() ;
		ResourceLoader.ret_media.sounds[get_resource_name(resource_url)]=new Audio();
		if (!ResourceLoader.ret_media.sounds[get_resource_name(resource_url)].canPlayType 
			|| ResourceLoader.ret_media.sounds[get_resource_name(resource_url)].canPlayType("audio/mp4")==""){ 
			return {playclip:function(){
                alert("Your browser doesn't support HTML5 audio or mp4/m4a");
                throw new Error("Your browser doesn't support HTML5 audio or mp4/m4a");
                }}
		}
		ResourceLoader.ret_media.sounds[get_resource_name(resource_url)].src=resource_url;
		ResourceLoader.ret_media.sounds[get_resource_name(resource_url)].addEventListener('canplaythrough', 
			ResourceLoader.log_and_remove_from_not_loaded('canplaythrough','sounds',resource_url)); // canplaythrough is 
			//sometimes clever and checks for connection instead of readyState, so we need further checking
		ResourceLoader.ret_media.sounds[get_resource_name(resource_url)].playclip=function(){
			try{
				console.log(ResourceLoader.ret_media.sounds[get_resource_name(resource_url)].error
				+  " - "+ResourceLoader.ret_media.sounds[get_resource_name(resource_url)].readyState
				+ " - "+ResourceLoader.ret_media.sounds[get_resource_name(resource_url)].networkState);
				ResourceLoader.ret_media.sounds[get_resource_name(resource_url)].pause();
				ResourceLoader.ret_media.sounds[get_resource_name(resource_url)].currentTime=0;
				ResourceLoader.ret_media.sounds[get_resource_name(resource_url)].play();
			}catch(exception){alert("error playing audio");}
		};
		//return audio_object; // not good for async stuff
	},
	log_and_remove_from_not_loaded: function(event_name,res_type,res_url){
		if(ResourceLoader.debug) console.log(event_name+" ("+res_type+": "+res_url+") "+get_resource_name(res_url));
		if(res_type=='sounds'){
			if (ResourceLoader.ret_media.sounds[get_resource_name(res_url)]===undefined || ResourceLoader.ret_media.sounds[get_resource_name(res_url)].readyState==0){
				if(ResourceLoader.debug) console.log("INFO: "+res_url+" fired canplaythrough but it is not loaded (res="+ResourceLoader.ret_media.sounds[get_resource_name(res_url)]+" or readyState="+ResourceLoader.ret_media.sounds[get_resource_name(res_url)].readyState+")");
				return; // break so this is still in "not_loaded"
			}
			ResourceLoader.ret_media.sounds[get_resource_name(res_url)].removeEventListener(event_name, ResourceLoader.log_and_remove_from_not_loaded);
		}else if(res_type=='images'){
            // nonexistent appear as complete (doesn't work), so we use "width"
			if (ResourceLoader.ret_media.images[get_resource_name(res_url)]===undefined ||
                !ResourceLoader.ret_media.images[get_resource_name(res_url)].complete ||     
                (ResourceLoader.ret_media.images[get_resource_name(res_url)].width==0 &&
                    res_url.toLowerCase().indexOf('.svg')==-1)
				){
				if(ResourceLoader.debug)
                    console.log("INFO: "+res_url+" fired loaded but it is not loaded (res="+res_url+", complete="+ResourceLoader.ret_media.images[get_resource_name(res_url)].complete+" or width="+ResourceLoader.ret_media.images[get_resource_name(res_url)].width+").");
				return; // break so this is still in "not loaded"
			}
			ResourceLoader.ret_media.images[get_resource_name(res_url)].removeEventListener(event_name, ResourceLoader.log_and_remove_from_not_loaded);
		}else if(res_type=='jsons'){
			ResourceLoader.ret_media.jsons[get_resource_name(res_url)]=JsonLazy.data[get_resource_name(res_url)];
		}
		ResourceLoader.load_progressbar.value+=1;
		ResourceLoader.not_loaded[res_type].splice(ResourceLoader.not_loaded[res_type].indexOf(res_url),1);
	},
	download_audio_ios: function(){
		ResourceLoader.modal_load_window.removeChild(document.getElementById('confirm_div'));
		// ResourceLoader.load_interval = , better with timeout + return
        alert("loading");
		setTimeout(function() {ResourceLoader.check_load_status()},
			ResourceLoader.media_load_check_status_interval);
		for(var i=0;i<ResourceLoader.not_loaded['sounds'].length;i++){
			ResourceLoader.ret_media.sounds[get_resource_name(ResourceLoader.not_loaded['sounds'][i])].load(); // play()-pause() with 1ms timeout extreme alternative
		}	
	},
	check_for_audios_readyState4: function(){
		for(var i=0;i<ResourceLoader.not_loaded.sounds.length;i++){
			var res_url=ResourceLoader.not_loaded.sounds[i];
			if (ResourceLoader.ret_media.sounds[get_resource_name(res_url)]!==undefined && ResourceLoader.ret_media.sounds[get_resource_name(res_url)].readyState==4){
				if(ResourceLoader.debug) console.log(res_url+" readyState==4 removing from not loaded.");
				ResourceLoader.log_and_remove_from_not_loaded('readyState4','sounds',res_url);
			}
		}
	},
	check_for_images_complete: function(){
		for(var i=0;i<ResourceLoader.not_loaded.images.length;i++){
			var res_url=ResourceLoader.not_loaded.images[i];
			if (ResourceLoader.ret_media.images[get_resource_name(res_url)]!==undefined && 
                ResourceLoader.ret_media.images[get_resource_name(res_url)].complete &&
                (ResourceLoader.ret_media.images[get_resource_name(res_url)].width>0 || res_url.toLowerCase().indexOf('.svg')!=-1)){
				if(ResourceLoader.debug) console.log(res_url+" complete==true (width>0 or svg) removing from not loaded.");
				ResourceLoader.log_and_remove_from_not_loaded('complete==true','images',res_url);
			}else{
                if(ResourceLoader.debug) console.log(res_url+" checking if complete==true (width>0 or svg)...");
            }
		}
	},
	check_load_status: function() {
		ResourceLoader.media_load_time+=ResourceLoader.media_load_check_status_interval;
        ResourceLoader.check_for_images_complete(); // update images status
        ResourceLoader.check_for_audios_readyState4(); // update audios status        
		if(ResourceLoader.debug) ResourceLoader.modal_dialog_msg.innerHTML='check_load_status '+ResourceLoader.media_load_time+' - progress: '+ResourceLoader.load_progressbar.value+' - max: '+ResourceLoader.load_progressbar.max
		// If there is no media to load
		if(ResourceLoader.num_images==0 && ResourceLoader.num_sounds==0 && ResourceLoader.num_jsons==0){
			document.body.removeChild(ResourceLoader.modal_load_window);
			ResourceLoader.callback_on_load_end(); // start the app even if audio is not loaded
			return;
		}
		// If all loaded, or all but sounds
		if (ResourceLoader.load_progressbar.value == ResourceLoader.load_progressbar.max || 
           ( ResourceLoader.load_progressbar.value==(ResourceLoader.num_images+ResourceLoader.num_jsons) && ResourceLoader.not_loaded['images'].length==0 && ResourceLoader.not_loaded['jsons'].length==0 && is_iOS) ) {
               //
			if(ResourceLoader.load_progressbar.value == ResourceLoader.load_progressbar.max){
				// If all media loaded
				document.body.removeChild(ResourceLoader.modal_load_window);
				ResourceLoader.callback_on_load_end(); // start the app even if audio is not loaded
				return;
			}else if(ResourceLoader.load_progressbar.value==(ResourceLoader.num_images+ResourceLoader.num_jsons)){
				// If all images loaded, check if lazy audio
				if(!ResourceLoader.lazy_audio && !ResourceLoader.download_lazy_audio_active){
					//clearInterval(ResourceLoader.load_interval); done by return+timeout
					ResourceLoader.download_lazy_audio_active=true;
					ResourceLoader.media_load_time=0;
					var ios_media_msg="Pulsa Ok para empezar";
					if(user_language=='en-US') ios_media_msg="Click Ok to start";
					ResourceLoader.modal_dialog_msg.innerHTML=ios_media_msg+' <button onclick="ResourceLoader.download_audio_ios()">Ok</button> ';
					return;
				}else if(ResourceLoader.lazy_audio){
					//clearInterval(ResourceLoader.load_interval); done by return+timeout
					document.body.removeChild(ResourceLoader.modal_load_window);
					ResourceLoader.callback_on_load_end(); // start the app even if audio is not loaded
					return;
				}
			}else{
				//clearInterval(ResourceLoader.load_interval); done by return+timeout
				document.body.removeChild(ResourceLoader.modal_load_window)
				ResourceLoader.callback_on_load_end() // start the app
				return;
			}
		}
		if (ResourceLoader.media_load_time==ResourceLoader.MEDIA_LOAD_TIMEOUT){
			//clearInterval(ResourceLoader.load_interval); done by return+timeout
            if( (ResourceLoader.load_progressbar.value==(ResourceLoader.num_images+ResourceLoader.num_jsons) && ResourceLoader.not_loaded['images'].length==0 && ResourceLoader.not_loaded['jsons'].length==0 )
                && ResourceLoader.lazy_audio && !ResourceLoader.download_lazy_audio_active){
                //clearInterval(ResourceLoader.load_interval); done by return+timeout
                //ResourceLoader.download_lazy_audio_active=true;
                //ResourceLoader.media_load_time=0;
                //var ios_media_msg="Pulsa Ok para empezar";
                //if(user_language=='en-US') ios_media_msg="Click Ok to start";
                //ResourceLoader.modal_dialog_msg.innerHTML=ios_media_msg+' <button onclick="ResourceLoader.download_audio_ios()">Ok</button> ';
                //ResourceLoader.modal_load_window.removeChild(document.getElementById('confirm_div'));
                alert("Carga sonidos aplazada");
                document.body.removeChild(ResourceLoader.modal_load_window);
                ResourceLoader.callback_on_load_end();
                return;
            }            
			var err_msg="";
			for(var i=0;i<ResourceLoader.not_loaded['images'].length;i++){
				var temp_obj=ResourceLoader.ret_media.images[get_resource_name(ResourceLoader.not_loaded['images'][i])];
				err_msg+="<br />Load "+get_resource_name(ResourceLoader.not_loaded['images'][i])+" complete="+temp_obj.complete+" width="+temp_obj.width;
			}
			for(var i=0;i<ResourceLoader.not_loaded['sounds'].length;i++){
				var temp_obj=ResourceLoader.ret_media.sounds[get_resource_name(ResourceLoader.not_loaded['sounds'][i])];
				err_msg+="<br />Error: "+temp_obj.error+  " - Ready: "+temp_obj.readyState+ " - Network: "+temp_obj.networkState;
			}
			// re-try by a button to reload url, previously loaded stuff should be cached (fast load)
			ResourceLoader.modal_dialog_msg.innerHTML='ERROR: Load media timeout (lazy='+ResourceLoader.lazy_audio+'). Not loaded ('+(ResourceLoader.not_loaded['images'].length+ResourceLoader.not_loaded['sounds'].length)+'): '+ResourceLoader.not_loaded['images']+'<br/>'+ResourceLoader.not_loaded['sounds']+' <br /> <a href="">retry</a> '+err_msg;
			return;
		}
		// recursively call itself until done	ResourceLoader.load_interval = 
		setTimeout(function() {ResourceLoader.check_load_status()},
			ResourceLoader.media_load_check_status_interval);
	},

	check_load_status_lazy_audio: function () {
        ResourceLoader.check_for_audios_readyState4(); // update audios status  
		ResourceLoader.media_load_time+=ResourceLoader.media_load_check_status_interval;
		if(ResourceLoader.debug)
				ResourceLoader.modal_dialog_msg.innerHTML='check_load_status '+ResourceLoader.media_load_time+
					' - progress: '+ResourceLoader.load_progressbar.value+' - max: '+ResourceLoader.load_progressbar.max;
		if (ResourceLoader.load_progressbar.value == ResourceLoader.load_progressbar.max) {	//alert("done")	
			document.body.removeChild(ResourceLoader.modal_load_window);
			clearInterval(ResourceLoader.load_interval);
			setTimeout(function(){ResourceLoader.callback_on_load_end()},500); // start the app
		}else if (ResourceLoader.media_load_time==ResourceLoader.MEDIA_LOAD_TIMEOUT){
			clearInterval(ResourceLoader.load_interval);
			var err_msg="";
			// re-try by a button to reload url, previously loaded stuff should be cached already (fast load)
			ResourceLoader.modal_dialog_msg.innerHTML='ERROR: Load lazy aduio timeout. Not loaded ('+ResourceLoader.not_loaded['sounds'].length+') <br /> <a href="">retry</a> '+err_msg;
		}
	},

	load_media: function (image_arr, sound_arr, json_arr, callback_function, lazy_audio_option, activate_debug){
		if(lazy_audio_option===undefined) ResourceLoader.lazy_audio=false;
		else ResourceLoader.lazy_audio=lazy_audio_option;
		ResourceLoader.debug=false;
		if(typeof(activate_debug)!=='undefined' && activate_debug==true) ResourceLoader.debug=activate_debug;
		ResourceLoader.ret_media={};ResourceLoader.ret_media.sounds=[];
        ResourceLoader.ret_media.images=[];ResourceLoader.ret_media.jsons=[];
		ResourceLoader.callback_on_load_end=callback_function;
		ResourceLoader.modal_load_window=document.createElement("div");
		ResourceLoader.modal_load_window.className="js-modal-window-transp";
		ResourceLoader.modal_dialog=document.createElement("div");
		ResourceLoader.modal_dialog.id="js-modal-dialog";
		ResourceLoader.modal_dialog.className="js-modal-dialog-progress";
		ResourceLoader.modal_dialog_title=document.createElement("span");
		ResourceLoader.modal_dialog_title.className="small-text";
		ResourceLoader.modal_dialog_title.innerHTML="Loading media...";
		ResourceLoader.modal_dialog_msg=document.createElement("p");
		ResourceLoader.modal_dialog_msg.id="js-modal-dialog-msg";
		ResourceLoader.modal_dialog_msg.className="small-text";
		ResourceLoader.load_progressbar=document.createElement("progress");
		ResourceLoader.num_images=image_arr.length;
		ResourceLoader.num_sounds=sound_arr.length;
		ResourceLoader.num_jsons=json_arr.length;
		ResourceLoader.load_progressbar.value=0; ResourceLoader.load_progressbar.max=ResourceLoader.num_images+ResourceLoader.num_sounds+ResourceLoader.num_jsons;

		ResourceLoader.not_loaded['images']=image_arr.slice();
		ResourceLoader.not_loaded['sounds']=sound_arr.slice(); // to show in case of error and lazy load (required in iOS)
		ResourceLoader.not_loaded['jsons']=json_arr.slice();
		ResourceLoader.download_lazy_audio_active = false;

		ResourceLoader.modal_dialog.appendChild(ResourceLoader.modal_dialog_title);
		ResourceLoader.modal_dialog.appendChild(ResourceLoader.load_progressbar);
		ResourceLoader.modal_dialog.appendChild(ResourceLoader.modal_dialog_msg);
		ResourceLoader.modal_load_window.appendChild(ResourceLoader.modal_dialog);
		document.body.appendChild(ResourceLoader.modal_load_window);
	
		//ResourceLoader.load_interval = , with Timeout to force a min time
		setTimeout(function() {ResourceLoader.check_load_status()},
			ResourceLoader.media_load_check_status_initial_min_splash);
		for (var i = 0; i < sound_arr.length; i++) {
			//ResourceLoader.ret_media.sounds[get_resource_name(sound_arr[i])]=ResourceLoader.load_sound(sound_arr[i]);
			ResourceLoader.load_sound(sound_arr[i]);
		}
		for (var i = 0; i < image_arr.length; i++) {
			//console.log(image_arr);console.log(i+"/"+image_arr.length+"--"+image_arr[i]+" -- "+get_resource_name(image_arr[i]));
			//ResourceLoader.ret_media.images[get_resource_name(image_arr[i])]=ResourceLoader.load_image(image_arr[i]);
			ResourceLoader.load_image(image_arr[i]);
		}
		for (var i = 0; i < json_arr.length; i++) {
			//console.log(image_arr);console.log(i+"/"+image_arr.length+"--"+image_arr[i]+" -- "+get_resource_name(image_arr[i]));
			//ResourceLoader.ret_media.images[get_resource_name(image_arr[i])]=ResourceLoader.load_image(image_arr[i]);
			ResourceLoader.load_json(json_arr[i]);
		}
		//return ResourceLoader.ret_media; //not good for async stuff
	},

	load_media_wait_for_lazy_audio: function(callback_function){
		ResourceLoader.callback_on_load_end=callback_function;
		ResourceLoader.modal_load_window=document.createElement("div");
		ResourceLoader.modal_load_window.className="js-modal-window-transp";
		ResourceLoader.modal_dialog=document.createElement("div");
		ResourceLoader.modal_dialog.id="js-modal-dialog";
		ResourceLoader.modal_dialog.className="js-modal-dialog-progress";
		ResourceLoader.modal_dialog_title=document.createElement("span");
		ResourceLoader.modal_dialog_title.className="small-text";
		ResourceLoader.modal_dialog_title.innerHTML="Loading audio (lazy)...";
		ResourceLoader.modal_dialog_msg=document.createElement("p");
		ResourceLoader.modal_dialog_msg.id="js-modal-dialog-msg";
		ResourceLoader.load_progressbar=document.createElement("progress");
		ResourceLoader.num_images=0; ResourceLoader.num_sounds=ResourceLoader.not_loaded['sounds'].length;
		ResourceLoader.load_progressbar.value=0; ResourceLoader.load_progressbar.max=ResourceLoader.num_images+ResourceLoader.num_sounds;
        ResourceLoader.media_load_time=0;
		ResourceLoader.modal_dialog.appendChild(ResourceLoader.modal_dialog_title);
		ResourceLoader.modal_dialog.appendChild(ResourceLoader.load_progressbar);
		ResourceLoader.modal_dialog.appendChild(ResourceLoader.modal_dialog_msg);
		ResourceLoader.modal_load_window.appendChild(ResourceLoader.modal_dialog);
		document.body.appendChild(ResourceLoader.modal_load_window);
		for(var i=0;i<ResourceLoader.not_loaded['sounds'].length;i++){
			ResourceLoader.ret_media.sounds[get_resource_name(ResourceLoader.not_loaded['sounds'][i])].load();
		}
		ResourceLoader.load_interval = setInterval(function() {
			ResourceLoader.check_load_status_lazy_audio()}, 
			ResourceLoader.media_load_check_status_interval);
	},
    
	check_if_lazy_sounds_loaded: function(callback_function){
        if(typeof(callback_function)==='undefined')
            throw new Error('check_if_lazy_sounds_loaded callback_function undefined');
        if(ResourceLoader.not_loaded['sounds'].length!=0){
            if(ResourceLoader.debug) console.log("Not loaded sounds: "+ResourceLoader.not_loaded['sounds'].length+"  "+ResourceLoader.not_loaded['sounds']);
            ResourceLoader.load_media_wait_for_lazy_audio(callback_function);
            return false;        
        }else{
            return true;
        }
    }

};

// responsive
var avoid_scrolling=function(event){
        event.preventDefault();
}
var prevent_scrolling=function(){
    document.body.addEventListener('touchmove', avoid_scrolling, false);
}
var allow_scrolling=function(){
    document.body.removeEventListener('touchmove', avoid_scrolling);
}

// avoid 300ms delay on touch...
var clickOrTouch = (('ontouchend' in window)) ? 'touchend' : 'click';
/* usage: document.getElementById('xxx').on(clickOrTouch, function() {
             // do something
          });*/








// MODAL WINDOWS
// it would be great to objectify this to easily interact with it (e.g., modify text)
/*
    If no accept or cancel functions are provided it shows a top right x to close
*/
function open_js_modal_alert(title_text, text_text, accept_function, cancel_function,accept_text,cancel_text){
    if(typeof(accept_text)=='undefined'){accept_text="Ok";}
    if(typeof(cancel_text)=='undefined'){cancel_text="Cancel";}
    
	var modal_window=document.createElement("div");
	modal_window.id="js-modal-window-alert"; modal_window.className="js-modal-window";

	var modal_dialog=document.createElement("div");
	modal_dialog.className="js-modal-dialog";

	var title_elem=document.createElement('h2')
	title_elem.innerHTML=title_text

	var text_elem=document.createElement('p')
	text_elem.id="js-modal-window-text";
	text_elem.innerHTML=text_text

	if(typeof(cancel_function)=='undefined'){
		var close_elem=document.createElement('a')
        close_elem.className="boxclose";
		close_elem.href="javascript:void(0)";
		close_elem.onclick=function (){
			var elem_to_remove=document.getElementById("js-modal-window-alert");
			elem_to_remove.parentNode.removeChild(elem_to_remove);
		}
		modal_dialog.appendChild(close_elem);
	}

	modal_dialog.appendChild(title_elem);
	modal_dialog.appendChild(text_elem);

	if(typeof(accept_function)!='undefined'){
		var accept_button=document.createElement('button');
		accept_button.innerHTML=accept_text;
		accept_button.onclick=accept_function;
		modal_dialog.appendChild(accept_button);
	}

	if(typeof(cancel_function)!='undefined'){
		var cancel_button=document.createElement('button');
		cancel_button.innerHTML=cancel_text;
		cancel_button.onclick=cancel_function;
		modal_dialog.appendChild(cancel_button);
	}


	modal_window.appendChild(modal_dialog);
	document.body.appendChild(modal_window);
}



var open_js_modal_content=function(html_content){  
	var modal_window=document.createElement("div")
	modal_window.id="js-modal-window"; modal_window.className="js-modal-window"
	modal_window.innerHTML=html_content;
	document.body.appendChild(modal_window);
	return modal_window;
}

function open_js_modal_content_accept(html_content){
	var modal_window=document.createElement("div")
	modal_window.id="js-modal-window"; modal_window.className="js-modal-window"
	var modal_dialog=document.createElement("div");
	modal_dialog.className="js-modal-dialog";
	modal_dialog.innerHTML=html_content;

	var close_elem=document.createElement('button')
	close_elem.innerHTML="Ok"
	close_elem.href="javascript:void(0)"
	close_elem.onclick=function (){
		var elem_to_remove=document.getElementById("js-modal-window")
		elem_to_remove.parentNode.removeChild(elem_to_remove)
	}

	modal_dialog.appendChild(close_elem)
	modal_window.appendChild(modal_dialog)
	document.body.appendChild(modal_window);
	return modal_window;
}


var remove_modal=function (id2remove){
	var id_remove='js-modal-window';
	if(id2remove!==undefined) id_remove=id2remove;
	var modal_window=document.getElementById(id_remove);
	if(modal_window!=null) modal_window.parentNode.removeChild(modal_window);
}

var open_js_modal_content_timeout=function(html_content, timeout_ms){
	open_js_modal_content(html_content);
	setTimeout(function(){remove_modal();},timeout_ms);
}


// STRING UTILS ///////////////////////////////////

function pad_string(val, digits, pad_char){
    var val_str = val + "", pad_str=""
    if(val_str.length < digits){
    	for(var i=digits-1;i>0;i--)pad_str+=pad_char
        return pad_str + val_str;
   }else
        return val_str;
}

// function 2_decimals --> .toFixed(2)

function get_resource_name(resource_url){
	if(resource_url.indexOf('/')!=-1) return resource_url.substring(resource_url.lastIndexOf('/')+1);
	return resource_url;
}

function isNumber(value) {
    if ((undefined === value) || (null === value)) return false;
    if (typeof value == 'number')  return true;
    return !isNaN(value - 0);
}
function isInteger(value) {     // in the future javacript will have Number.isInteger, etc
    if ((undefined === value) || (null === value))  return false;
    return value % 1 == 0;     // or   return mixed_var === +mixed_var && isFinite(mixed_var) && !(mixed_var % 1);
}


//////////////////// TIMER FOR A USER ACTIVITY OF ANY KIND ////////////// 
var ActivityTimer=function (tricker_cb,limit_end_sec,end_cb){	
	this.seconds=0;
	this.started=false;
	this.dom_anchor=undefined;
	this.advance_timeout=null;
	this.tricker_callback=undefined;
	if(tricker_cb!==undefined){this.tricker_callback=tricker_cb;}
	this.limit_end_seconds=undefined;
	if(limit_end_sec!==undefined){this.limit_end_seconds=limit_end_sec;}
	this.end_callback=undefined;
	if(end_cb!==undefined){this.end_callback=end_cb;}
}
ActivityTimer.prototype.anchor_to_dom=function(elem){this.dom_anchor=elem;}
ActivityTimer.prototype.set_tricker_callback=function(cb){this.tricker_callback=cb;}
ActivityTimer.prototype.set_limit_end_seconds=function(sec){this.limit_end_seconds=sec;}
ActivityTimer.prototype.set_end_callback=function(cb){this.end_callback=cb;}
ActivityTimer.prototype.start=function(){
	if(this.dom_anchor==undefined && this.tricker_callback==undefined){
		console.log("WARNING: Starging an activity_timer without defining dom_anchor or tricker_callback");
        // but still run it... we might want it to be hidden from the user...
	}
	if(this.started){
		console.log("ERROR: activity_timer already started");
	}else{
		this.started=true
		if(this.dom_anchor!=undefined){
			this.dom_anchor.innerHTML="00:"+pad_string( (this.seconds / 60) >> 0,2,"0")+":"+pad_string(this.seconds % 60,2,"0");
		}
		this.advance_timeout=setTimeout(function(){this.advance()}.bind(this),1000);
	}
}
ActivityTimer.prototype.advance=function(){
	if(this.started){
		++this.seconds
		// seconds only is easier and calculations are fast...
		//if (this.seconds>=60){++this.minutes;this.seconds=0}
		//this.dom_anchor.innerHTML=pad_string(activity_timer_minutes,2,"0")+":"+pad_string(this.seconds,2,"0")
		if(this.dom_anchor!=undefined){
			this.dom_anchor.innerHTML="00:"+pad_string( (this.seconds / 60) >> 0,2,"0")+":"+pad_string(this.seconds % 60,2,"0");
		}
		if(this.tricker_callback!=undefined){
			this.tricker_callback();
		}
		if(this.limit_end_seconds!=undefined && this.seconds>=this.limit_end_seconds){
			this.stop();
			if(this.end_callback!=undefined){this.end_callback();}
			else{console.log('Timer stopped at limit_end_seconds but not end_callback found');}			
		}else{
			this.advance_timeout=setTimeout(function(){this.advance()}.bind(this),1000);
		}
	}else{
		console.log("ERROR: activity_timer not started. Starting it.");
		this.start();
	}
}
ActivityTimer.prototype.stop=function(){
	clearTimeout(this.advance_timeout);
	this.started=false;
}
ActivityTimer.prototype.reset=function (){	
	this.stop();
	if(this.dom_anchor!=undefined){
		this.dom_anchor.innerHTML="00:00:00";
	}
	this.seconds=0; // this.minutes=0
}
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////




/// Audio Sprite //////////////////////
var AudioSprite=function(audio_object, sprite_ref, activate_debug){
	this.audio_obj=audio_object; 	// either created in js or got from DOM
	this.sound_range_ref=sprite_ref;	// index of sounds in sprite (as ranges)
	this.currentSpriteRange = {}; 	// current sprite being played
	this.range_ended=true;
	this.seeked_and_paused_intents=0;
	//this.audio_obj.removeEventListener('timeupdate', this.onAudioSpriteTimeUpdate, false); // for safety
	//this.audio_obj.addEventListener('timeupdate', this.onAudioSpriteTimeUpdate.bind(this), false);
	this.debug=false;
	if(typeof(activate_debug)!=='undefined' && activate_debug==true) this.debug=activate_debug;
}
AudioSprite.FLOAT_THRESHOLD=0.005;	// for millisec comparison
AudioSprite.AUDIO_RALENTIZATION_LAG=0.005; // margin for sound range ended check (default 0.040)
AudioSprite.CHECK_SOUND_POSITION_TIMEOUT=100; // verify if sprite ended timeout (ms)
AudioSprite.CHECK_IF_SEEKED_PAUSED_MAX_INTENTS=5; // verify if audio paused and not seeking
AudioSprite.prototype.playSpriteRange = function(range_id,callback_function) {
	if(this.range_ended==false || !this.audio_obj.paused) alert("ERROR: trying to play a sprite range while other not ended");
	if(callback_function===undefined) delete this.audio_obj.callback_on_end;
	else this.audio_obj.callback_on_end=callback_function;
	// effectless in data-connections----
	//this.audio_obj.currentTime = 0;
	//this.wait_seeked_and_paused();
	//------------------------------------
	if (this.sound_range_ref[range_id]) { // assumes the array is correct (contains start and end)
		if(this.debug) console.log("range_id ("+range_id+") found");
		this.currentSpriteRange = this.sound_range_ref[range_id];
		this.audio_obj.currentTime = this.currentSpriteRange.start; // currentTime not supported on IE9 (DOM Exception INVALID_STATE_ERR)
		this.range_ended=false;
		// HACK: for data connections ---------
		setTimeout(function(){this.audioSpritePositionCheck();}.bind(this),AudioSprite.CHECK_SOUND_POSITION_TIMEOUT);
		this.audio_obj.play();
		// -----------------------
		//this.play_safe(this.currentSpriteRange.start); doesn't work on data-connections (no seeking until play())
	}else{
		alert("ERROR: Sprite ("+range_id+") not found!");
		this.range_ended=true;
		if(this.audio_obj.hasOwnProperty("callback_on_end") && typeof(this.audio_obj.callback_on_end) === 'function' ) this.audio_obj.callback_on_end();
	}
};
/*AudioSprite.prototype.play_safe=function(seek_position){ // wait until paused and not seekeing
	// PROBLEM, on mobiles with data-conntection (not wifi), audio won't start to seek until play() event
	if(this.audio_obj.paused && !this.audio_obj.seekeing && 
		Math.abs(this.audio_obj.currentTime-seek_position)<AudioSprite.FLOAT_THRESHOLD){
			setTimeout(function(){this.audioSpritePositionCheck();}.bind(this),AudioSprite.CHECK_SOUND_POSITION_TIMEOUT);
			this.audio_obj.play();
		}
	else setTimeout(function(){ // more efficien could be trying to use events... but complicates things...
				if(this.debug) alert("waiting to play safe ct:"+this.audio_obj.currentTime+" - seeking-pos: "+seek_position+" - is-paused: "+this.audio_obj.paused+" - is-seeking: "+this.audio_obj.seekeing+" - abs(currenttime-seekpos): "+Math.abs(this.audio_obj.currentTime-seek_position));
				this.play_safe(seek_position);
			}.bind(this),250);
}*/
/*AudioSprite.prototype.wait_seeked_and_paused=function(){// wait until paused and not seekeing
	// Although 'seeking' is undefined in data-connections it works since it is evaluated to false in js
	if(this.audio_obj.paused && !this.audio_obj.seekeing) return;
	else setTimeout(function(){
				this.seeked_and_paused_intents++;
				if(this.seeked_and_paused_intents>=AudioSprite.CHECK_IF_SEEKED_PAUSED_MAX_INTENTS){
					alert("ERROR: Problems pausing audio (wait_seeked_and_paused)");
				}
				if(this.debug) alert("waiting to seek safe ct:"+this.audio_obj.currentTime);
				this.wait_seeked_and_paused();
			}.bind(this),250);
}*/
AudioSprite.prototype.audioSpritePositionCheck = function() {// time update handler to ensure we stop when a sprite is complete
	if(this.debug)console.log("playing: "+this.audio_obj.currentSrc+" time:"+this.audio_obj.currentTime+" ended:"+this.audio_obj.ended);
	if (this.ended || (!this.range_ended && this.audio_obj.currentTime >= (this.currentSpriteRange.end+AudioSprite.AUDIO_RALENTIZATION_LAG)) ) {
		if(this.debug) console.log("Sprite range play ended!!");
		this.audio_obj.pause();
		// probably, unneeded----------------
		//this.seeked_and_paused_intents=0;
		//this.wait_seeked_and_paused();
		//------------------------------------
		//this.currentTime=0; // probably unnecessary
		//this.wait_seeked_and_paused();
		this.range_ended=true
		if(this.audio_obj.hasOwnProperty("callback_on_end") && typeof(this.audio_obj.callback_on_end) === 'function' ) this.audio_obj.callback_on_end();
	}else{ // keep-playing-and check again later
		setTimeout(function(){this.audioSpritePositionCheck();}.bind(this),AudioSprite.CHECK_SOUND_POSITION_TIMEOUT);
	}
};
// DEPRECATED... TOO MUCH CHECKINGS... DO NOT DELETE IN CASE WE NEED IT...
/*AudioSprite.prototype.onAudioSpriteTimeUpdate = function() {// time update handler to ensure we stop when a sprite is complete
   if(this.debug)console.log("playing: "+this.audio_obj.currentSrc+" time:"+audio_obj.currentTime+" ended:"+audio_obj.ended)
    if (this.ended || (!this.range_ended && this.audio_obj.currentTime >= (this.currentSpriteRange.end+AudioSprite.AUDIO_RALENTIZATION_LAG)) ) { 
    	if(this.debug) console.log("Sprite range play ended!!")
        this.audio_obj.pause()
        this.wait_seeked_and_paused()
        this.currentTime=0 // probably unnecessary
        this.wait_seeked_and_paused()
       	this.range_ended=true
	if(this.audio_obj.hasOwnProperty("callback_on_end") && typeof(this.audio_obj.callback_on_end) === 'function' ) this.audio_obj.callback_on_end();
    }
};*/


///////////////////////////////////////


////////////////////////////////////////////////
var SoundChain={
	audio_chain_waiting: false,
	audio_chain_position: 0,
	calls: 0,
	sound_array: undefined,
	audio_sprite: undefined,
	debug_mode: false,
	callback_func: null,

	play_sound_arr: function(sound_arr, audio_sprt, callback_func, debug_mode){
		if(this.audio_chain_waiting==true){
			throw new Error("SoundChain.play_sound_arr "+sound_arr+" is already playing");
		}else if(typeof(sound_arr)==='undefined' || typeof(audio_sprt)==='undefined' || typeof(callback_func)==='undefined'){
			throw new Error("SoundChain.play_sound_arr required arguments: sound_arr, audio_sprite, callback_function");
		}else{
			if(typeof(debug_mode)!=='undefined') this.debug_mode=debug_mode;
			if(this.debug_mode) console.log("callback: "+callback_func);
			this.sound_array=sound_arr;
			this.audio_sprite=audio_sprt;
			this.audio_chain_waiting=true;
			this.audio_chain_position=0;
			this.callback_func=callback_func;
			this.play_sprite_chain();
		}
	},

	play_sprite_chain: function(){
		if(this.callback_func==null) throw new Error("callback not defined");
		if(this.audio_chain_position>=this.sound_array.length){
			this.sound_array=undefined;
			this.audio_chain_waiting=false;
			this.audio_chain_position=0;
			this.calls=0;
			this.callback_func();
		}else{
			while (this.sound_array[this.audio_chain_position]=="/") {this.audio_chain_position++;} // ignore
			if(this.debug_mode) console.log("playing: "+this.audio_sprite.audio_obj.currentSrc+" time:"+this.audio_sprite.audio_obj.currentTime+" ended:"+this.audio_sprite.audio_obj.ended+" paused:"+this.audio_sprite.audio_obj.paused+" calls:"+this.calls+" range_id:"+this.sound_array[this.audio_chain_position]+" audio_chain_position:"+this.audio_chain_position+" audio_chain_waiting:"+this.audio_chain_waiting);
			this.calls++;
			this.audio_sprite.playSpriteRange(this.sound_array[this.audio_chain_position],this.audio_chain_callback.bind(this))
		}
	},
	
	audio_chain_callback: function () {
		if(this.audio_chain_waiting==true){
			this.audio_chain_position++;
			this.play_sprite_chain();
		}
	}
	
}


//////////////// Normal (no-sprite) audios handler ////////////////////////
var AudioLib={
	sounds_ref: undefined,
	debug: false,
	sound_single: undefined,
	sound_single_ended: true,
	sound_single_callback: undefined,
	sound_arr: undefined,
	sound_arr_ended: true,
	sound_arr_pos: 0,
	sound_arr_callback: undefined,
	init: function(sounds_ref, activate_debug){
	 	if(typeof(sounds_ref)=='undefined')
				throw new Error("AudioLib sounds_ref must be defined");
		AudioLib.sounds_ref=sounds_ref;
		AudioLib.debug=false;
		if(typeof(activate_debug)!=='undefined' && activate_debug==true) AudioLib.debug=activate_debug;
	},
	play_sound_arr: function(arr,callback){
		if(!AudioLib.sound_arr_ended || !AudioLib.sound_single_ended)
			throw new Error("AudioLib trying to play_sound_arr while another is still playing");
		AudioLib.sound_arr_ended=false;
		AudioLib.sound_arr=arr;
	 	if(typeof(callback)=='undefined')
				throw new Error("AudioLib play_sound_arr callback must be defined");
		this.sound_arr_callback=callback;
		if(AudioLib.sound_arr.length>0){
			AudioLib.play_sound_single(AudioLib.sound_arr[AudioLib.sound_arr_pos],AudioLib.play_sound_arr_next);
		}
	},
	play_sound_arr_next: function(){
		if(!AudioLib.sound_single_ended)
			throw new Error("AudioLib trying to play_sound_arr while another is still playing");
		AudioLib.sound_arr_pos++;
		if(AudioLib.sound_arr_pos < AudioLib.sound_arr.length){
			AudioLib.play_sound_single(AudioLib.sound_arr[AudioLib.sound_arr_pos],AudioLib.play_sound_arr_next);
		}else{
			AudioLib.sound_arr=undefined;
			AudioLib.sound_arr_pos=0;
			AudioLib.sound_arr_ended=true;
			AudioLib.sound_arr_callback();
			AudioLib.sound_arr_callback=undefined;
		}
	},
	play_sound_single: function(sound_name,callback){
		if(!AudioLib.sound_single_ended)
			throw new Error("AudioLib trying to play_sound_single while another is still playing");
		AudioLib.sound_single_ended=false;
		AudioLib.sound_single=sound_name;
	 	if(typeof(callback)=='undefined')
			throw new Error("AudioLib play_sound_arr callback must be defined");
		AudioLib.sound_single_callback=callback;
		if(!AudioLib.sounds_ref.hasOwnProperty(sound_name))
			throw new Error("AudioLib play_sound_single "+sound_name+" not found");
		AudioLib.sounds_ref[sound_name].play();
		setTimeout(function(){AudioLib.check_sound_finished();}, 200);
	},
	check_sound_finished: function(){
		if(AudioLib.sounds_ref[AudioLib.sound_single].ended){
			if(AudioLib.debug) console.log("AudioLib ended: "+AudioLib.sound_single+" time: "+AudioLib.sounds_ref[AudioLib.sound_single].currentTime);
			AudioLib.sound_single_ended=true;
			AudioLib.sound_single_callback();
		}else{
			if(AudioLib.debug) console.log("AudioLib waiting..."+AudioLib.sound_single+" time: "+AudioLib.sounds_ref[AudioLib.sound_single].currentTime);
			setTimeout(function(){AudioLib.check_sound_finished();}, 200);
		}
	}
}

// --------------------------------------------------










/*
Data tables
<table cellpadding="0" cellspacing="0" border="0" class="display" id="example"></table>

document.getElementById('example').DataTable( {
    data: data,
    columns: [
        { data: 'name' },
        { data: 'position' },
        { data: 'salary' },
        { data: 'office' }
    ]
} );

Optionally define: 
- row_id (default: row position/index)
- row_id_prefix (default: 'row')
*/
var DataTableSimple = function (table_config){
	// Empty table
	this.innerHTML = "";

	var table_head = this.createTHead();
	var table_body = this.createTBody();
	
	if(table_config.hasOwnProperty('columns')){
		var table_row=table_head.insertRow(table_head.rows.length);
		for(var table_column=0;table_column<table_config.columns.length;table_column++){
				//var table_cell  = table_row.insertCell(table_column);
				var th = document.createElement('th');
				var col_header=table_config.columns[table_column].data;
				if (table_config.columns[table_column].hasOwnProperty('col_header')){
					col_header=table_config.columns[table_column].col_header;
				}
				var cell_text  = document.createTextNode(col_header);
				th.appendChild(cell_text);
				table_row.appendChild(th);
		}
	}
	if(table_config.hasOwnProperty('data')){
		//alert('has data '+table_config.data.length);
		var row_id_prefix='row'
		if(table_config.hasOwnProperty('row_id_prefix')) row_id_prefix=table_config.row_id_prefix;
		for(var i=0;i<table_config.data.length;i++){
			var table_row   = table_body.insertRow(table_body.rows.length);
			if(table_config.hasOwnProperty('row_id')) table_row.id=row_id_prefix+"-"+table_config.data[i][table_config.row_id];
			else table_row.id=row_id_prefix+"-"+i;
			for(var table_column=0;table_column<table_config.columns.length;table_column++){
				var table_cell  = table_row.insertCell(table_column);
				var text=table_config.data[i][table_config.columns[table_column].data];
				if (table_config.columns[table_column].hasOwnProperty('format') && DataTableSimple.formats.hasOwnProperty(table_config.columns[table_column].format)){
					text=DataTableSimple.formats[table_config.columns[table_column].format](text); 
				}
				var cell_text  = document.createTextNode(text);
				table_cell.appendChild(cell_text);
				if (table_config.columns[table_column].hasOwnProperty('special') && DataTableSimple.specials[table_config.columns[table_column].special]!==undefined){
					table_cell.innerHTML=DataTableSimple.specials[table_config.columns[table_column].special](table_config, i, table_row); 
				}
				if (table_config.columns[table_column].hasOwnProperty('link_function_id') && table_config.columns[table_column].link_function_id!==undefined){
					table_cell.innerHTML=DataTableSimple.link_function_id(table_config, i, table_row, table_config.columns[table_column].data, table_config.columns[table_column].link_function_id); 
				}
				if (table_config.columns[table_column].hasOwnProperty('link_function_id_button') && table_config.columns[table_column].link_function_id_button!==undefined){
					table_cell.innerHTML=DataTableSimple.link_function_id_button(table_config, i, table_row, table_config.columns[table_column].data, table_config.columns[table_column].link_function_id_button); 
				}
			}
		}
	}
	if(table_config.hasOwnProperty('pagination_date') && isInteger(table_config.pagination_date) && table_config.pagination_date > 0){
		this.insertAdjacentHTML('beforebegin', '<div id="'+this.id+'-date"></div>');
        this.insertAdjacentHTML('afterend', '<div id="'+this.id+'-nav"></div>');
		var tabpagination=document.getElementById(this.id+'-nav');
		if(table_config.data.length==0) return; // no data, empty table
        var numPages = 1; 
        var page_index_and_lenght_arr=[];
        var curr_page_start=page_index_and_lenght_arr.length;
        var curr_page_end=curr_page_start;
        var curr_page_date=table_config.data[0].timestamp.substr(0,10);
        
        // configure pages and hide all
		var tr_rows=document.querySelectorAll('#'+this.id+' tbody tr');
		for(var i=0;i<tr_rows.length;i++){
            tr_rows[i].style.display="none";
            if(curr_page_date!=table_config.data[i].timestamp.substr(0,10) || 
                (curr_page_end-curr_page_start)>=table_config.pagination_date){
                page_index_and_lenght_arr.push([curr_page_start,curr_page_end-1,curr_page_date]);
                curr_page_date=table_config.data[i].timestamp.substr(0,10);
                tabpagination.innerHTML +='<a href="#" rel="'+(page_index_and_lenght_arr.length-1)+'">'+page_index_and_lenght_arr.length+'</a> ';
                curr_page_start=curr_page_end;
            }
            curr_page_end++;
        }
        if((curr_page_end-curr_page_start)>0){
            page_index_and_lenght_arr.push([curr_page_start,curr_page_end,curr_page_date]);
            tabpagination.innerHTML +='<a href="#" rel="'+(page_index_and_lenght_arr.length-1)+'">'+page_index_and_lenght_arr.length+'</a> ';
        }
        // add events
        var tabpaglinks=document.querySelectorAll('#'+this.id+'-nav a');
		for(var i=0;i<tabpaglinks.length;i++){
            tabpaglinks[i].addEventListener('click', function(){
                // remove spans "..." for huge
                var tabpagspans=document.querySelectorAll('#'+this.parentNode.id+' span');
                for(var i2=0;i2<tabpagspans.length;i2++){this.parentNode.removeChild(tabpagspans[i2]);}
                
                var tabpaglinks2=this.parentNode.children;
                for(var i2=0;i2<tabpaglinks2.length;i2++){
                    tabpaglinks2[i2].classList.remove('active-pagination');
                    tabpaglinks2[i2].style.display='';
                }
                this.classList.add('active-pagination');
                var currPage = Number(this.rel);
                if (typeof cache_cognitionis_pagination_page !== 'undefined') {
                    cache_cognitionis_pagination_page=currPage;
                }
                var startItem = page_index_and_lenght_arr[currPage][0];
                var endItem = page_index_and_lenght_arr[currPage][1];
                //console.log(currPage+"  "+startItem+"-"+endItem);
                // hide all and show range
                var tr_rows=document.querySelectorAll('#'+this.parentNode.id.replace("-nav","")+' tbody tr');
                for(var i=0;i<tr_rows.length;i++){tr_rows[i].style.display="none";}
                for(var i=startItem;i<tr_rows.length;i++){
                    if(i>endItem) break;tr_rows[i].style.display="";
                }
                document.getElementById(this.parentNode.id.replace("-nav","")+'-date').innerHTML=page_index_and_lenght_arr[currPage][2];
                // handle huge
                if(tabpaglinks2.length>10){
                    if(currPage<tabpaglinks2.length-5){
                        //alert("smaller n-5. cur="+currPage+" starthide"+(currPage+2)+" endhide"+((tabpaglinks2.length)-2));
                        var newItem2 = document.createElement('span');
                        var textnode2 = document.createTextNode('...');
                        newItem2.appendChild(textnode2);
                        var min_start=Math.max(2,currPage);
                        for(var i2=min_start+3;i2<tabpaglinks2.length-2;i2++){tabpaglinks2[i2].style.display='none';}
                        this.parentNode.insertBefore(newItem2, this.parentNode.childNodes[this.parentNode.childNodes.length-4]);
                    }
                    if(currPage>4){
                        //alert("greater 4. cur="+currPage+" starthide"+(2)+" endhide"+(currPage-2));
                        var newItem = document.createElement('span');
                        var textnode = document.createTextNode('...');
                        newItem.appendChild(textnode);
                        var max_end=Math.min(tabpaglinks2.length-3,currPage);
                        for(var i2=2;i2<max_end-2;i2++){tabpaglinks2[i2].style.display='none';}
                        this.parentNode.insertBefore(newItem, this.parentNode.childNodes[3]);
                    }
                }
            });
        }
        // show page 1
        document.getElementById(this.id+'-date').innerHTML=page_index_and_lenght_arr[0][2];
		for(var i=0;i<tr_rows.length;i++){
            if(i>page_index_and_lenght_arr[0][1]) break; 
            tr_rows[i].style.display="";
        }
		document.querySelector('#'+this.id+'-nav a').classList.add('active-pagination');
        // handle huge
        if(page_index_and_lenght_arr.length>10){
            var tabpaglinks=document.querySelectorAll('#'+this.id+'-nav a');
            for(var i=5;i<(tabpaglinks.length-2);i++){tabpaglinks[i].style.display='none';}
            var newItem = document.createElement('span');
            var textnode = document.createTextNode('...');  // Create a text node
            newItem.appendChild(textnode); 
            tabpagination.insertBefore(newItem, tabpagination.childNodes[tabpagination.childNodes.length-4]);
        }
	}else if(table_config.hasOwnProperty('pagination') && isInteger(table_config.pagination) && table_config.pagination > 0){
		this.insertAdjacentHTML('afterend', '<div id="'+this.id+'-nav"></div>');
		var tabpagination=document.getElementById(this.id+'-nav');
		var rowsShown = table_config.pagination;
		var rowsTotal = table_config.data.length;
		var numPages = rowsTotal/rowsShown;
		//alert("pagination "+rowsTotal+" "+rowsShown+" "+numPages);
		for(var i=0;i < numPages;i++) {
		    var pageNum = i + 1;
		    tabpagination.innerHTML +='<a href="#" rel="'+i+'">'+pageNum+'</a> ';
		}
		
        // configure pages
		var tabpaglinks=document.querySelectorAll('#'+this.id+'-nav a');
		for(var i=0;i<tabpaglinks.length;i++){
			tabpaglinks[i].addEventListener('click', function(){
                // remove spans "..." for huge
                var tabpagspans=document.querySelectorAll('#'+this.parentNode.id+' span');
                for(var i2=0;i2<tabpagspans.length;i2++){this.parentNode.removeChild(tabpagspans[i2]);}
                
                var tabpaglinks2=this.parentNode.children;
                for(var i2=0;i2<tabpaglinks2.length;i2++){
                    tabpaglinks2[i2].classList.remove('active-pagination');
                    tabpaglinks2[i2].style.display='';
                }
                this.classList.add('active-pagination');
                var currPage = Number(this.rel);
                if (typeof cache_cognitionis_pagination_page !== 'undefined') {
                    cache_cognitionis_pagination_page=currPage;
                }

				var startItem = currPage * rowsShown;
				var endItem = startItem + rowsShown;
				//console.log(currPage+"  "+startItem+"-"+endItem);
				var tr_rows=document.querySelectorAll('#'+this.parentNode.id.replace("-nav","")+' tbody tr');
				for(var i=0;i<tr_rows.length;i++){tr_rows[i].style.display="none";}
				for(var i=startItem;i<tr_rows.length;i++){if(i>=endItem) break; tr_rows[i].style.display="";}
                if(tabpaglinks2.length>10){
                    if(currPage<tabpaglinks2.length-5){
                        //alert("smaller n-5. cur="+currPage+" starthide"+(currPage+2)+" endhide"+((tabpaglinks2.length)-2));
                        var newItem2 = document.createElement('span');
                        var textnode2 = document.createTextNode('...');
                        newItem2.appendChild(textnode2);
                        var min_start=Math.max(2,currPage);
                        for(var i2=min_start+3;i2<tabpaglinks2.length-2;i2++){tabpaglinks2[i2].style.display='none';}
                        this.parentNode.insertBefore(newItem2, this.parentNode.childNodes[this.parentNode.childNodes.length-4]);
                    }
                    if(currPage>4){
                        //alert("greater 4. cur="+currPage+" starthide"+(2)+" endhide"+(currPage-2));
                        var newItem = document.createElement('span');
                        var textnode = document.createTextNode('...');
                        newItem.appendChild(textnode);
                        var max_end=Math.min(tabpaglinks2.length-3,currPage);
                        for(var i2=2;i2<max_end-2;i2++){tabpaglinks2[i2].style.display='none';}
                        this.parentNode.insertBefore(newItem, this.parentNode.childNodes[3]);
                    }
                }
			});
		}
        // hide all and show first by default
		var tr_rows=document.querySelectorAll('#'+this.id+' tbody tr');
		for(var i=0;i<tr_rows.length;i++){tr_rows[i].style.display="none";}
		for(var i=0;i<tr_rows.length;i++){if(i>=rowsShown) break; tr_rows[i].style.display="";}
		document.querySelector('#'+this.id+'-nav a').classList.add('active-pagination');
        // handle huge
        if(tabpaglinks.length>10){
            var tabpaglinks=document.querySelectorAll('#'+this.id+'-nav a');
            for(var i=5;i<(tabpaglinks.length-2);i++){tabpaglinks[i].style.display='none';}
            var newItem = document.createElement('span');
            var textnode = document.createTextNode('...');  // Create a text node
            newItem.appendChild(textnode); 
            tabpagination.insertBefore(newItem, tabpagination.childNodes[tabpagination.childNodes.length-4]);
        }
	}

};
DataTableSimple.formats={};
DataTableSimple.specials={};
DataTableSimple.formats.percentage_int=function (data){
	if(data===undefined) return "-";
	data=data*100;
	return data.toString().split(".")[0]+"%";
};
DataTableSimple.formats.time_from_seconds=function (data){
	if(data===undefined) return "-";
	return pad_string( (data / 3600) >> 0,2,"0")+":"+pad_string( (data / 60) >> 0,2,"0")+":"+pad_string(data % 60,2,"0")
};
DataTableSimple.formats.time_from_seconds_up_to_mins=function (data){
	if(data===undefined) return "-";
	return pad_string( (data / 60) >> 0,2,"0")+":"+pad_string(data % 60,2,"0")
};
DataTableSimple.formats.first_4=function (data){
	if(data===undefined) return "-";
	return data.substring(0,4);
};
DataTableSimple.formats.first_12=function (data){  // make this a configurable special...
	if(data===undefined) return "-";
	if(data.length>12) return data.substring(0,12)+"..";
	return data;
};
DataTableSimple.specials.red_incorrect=function (table_config,i,table_row){
	if(table_config===undefined || i===undefined) return "error!";
	var text="correcto";
    if(table_config.data[i].result=="incorrect") text="incorrecto";
	if(text=='incorrecto'){
        table_row.style.color='red';
        //table_row.style.backgroundColor='#ddd';
    } // return '<span style="background-color:red">'+text+'</span>';}
	return text;
};
/*DataTableSimple.formats.last_4=function (data,n){
	if(data===undefined) return "-";
	return data.substring(data.length - 4);
};*/
DataTableSimple.link_function_id=function (table_config,i,table_row, table_column_name, function_id){
	if(table_config===undefined || i===undefined) throw "error: no table config or no index";
	if(!table_config.hasOwnProperty("row_id")) throw "error: row-id undefined";
	var id_cleaned=table_config.data[i][table_config.row_id].replace(table_config.row_id_prefix+"-","");
	var text=table_column_name;
    if(table_config.data[i].hasOwnProperty(table_column_name)){
        text=table_config.data[i][table_column_name];
    }
	return '<a href="javascript:void(0)" onclick="'+function_id+'(\''+id_cleaned+'\')">'+text+'</a>'; // substring...
};
DataTableSimple.link_function_id_button=function (table_config,i,table_row, button_text, function_id){
	if(table_config===undefined || i===undefined) throw "error: no table config or no index";
	if(!table_config.hasOwnProperty("row_id")) throw "error: row-id undefined";
	var id_cleaned=table_config.data[i][table_config.row_id].replace(table_config.row_id_prefix+"-","");
	return '<button style="min-height:24px;" onclick="'+function_id+'(\''+id_cleaned+'\')">'+button_text+'</button>'; // substring...
};

function select_fill_with_json(data,select_elem, selected){
	select_elem.innerHTML="";
	for(var key in data){
		if (data.hasOwnProperty(key)) {
            var selected_html="";
            if(typeof(selected)!='undefined' && selected==key) selected_html='selected="selected"';
			select_elem.innerHTML+='<option value="' + key + '" '+selected_html+'>' + key + '</option>';
		}
	}
}


function selectorExistsInCSS(styleSheetName, selector) {
    // Get the index of 'styleSheetName' from the document.styleSheets object
    for (var i = 0; i < document.styleSheets.length; i++) {
        var thisStyleSheet = document.styleSheets[i].href ? document.styleSheets[i].href.replace(/^.*[\\\/]/, '') : '';
        if (thisStyleSheet == styleSheetName) { var idx = i; break; }
    }
    if (!idx) return false; // We can't find the specified stylesheet

    // Check the stylesheet for the specified selector
    var styleSheet = document.styleSheets[idx];
    var cssRules = styleSheet.rules ? styleSheet.rules : styleSheet.cssRules;
    for (var i = 0; i < cssRules.length; ++i) {
        if(cssRules[i].selectorText == selector) return true;
    }
    return false;
}

function getAllCSSselectorsMatching(styleSheetName, reg_ex){
    var matched_selectors=[];
    // Get the index of 'styleSheetName' from the document.styleSheets object
    for (var i = 0; i < document.styleSheets.length; i++) {
        var thisStyleSheet = document.styleSheets[i].href ? document.styleSheets[i].href.replace(/^.*[\\\/]/, '') : '';
        if (thisStyleSheet == styleSheetName) { var idx = i; break; }
    }
    if (!idx) return matched_selectors; // We can't find the specified stylesheet

    // Check the stylesheet for the specified selector
    var styleSheet = document.styleSheets[idx];
    var cssRules = styleSheet.rules ? styleSheet.rules : styleSheet.cssRules;
    for (var i = 0; i < cssRules.length; ++i) {
        if(reg_ex.test(cssRules[i].selectorText)) matched_selectors.push(cssRules[i].selectorText);
    }
    return matched_selectors;
    
}


var showFormAllErrorMessages = function() {
	var form=this.form;	
	var errorList = form.getElementsByClassName("errorMessages")[0];
    errorList.innerHTML="";

    // Find all invalid fields within the form.
    var invalidFields = form.querySelectorAll(":invalid");
	if(invalidFields.length!=0){
		for(var i=0;i<invalidFields.length;i++){
		    // Find the field's corresponding label
		    var label = form.querySelector( "label[for=" + invalidFields[i].id + "] ");
		    // Opera incorrectly does not fill the validationMessage property.
		    var message = invalidFields[i].validationMessage || 'Invalid value.';
		    errorList.innerHTML+="<li><span>" + label.innerHTML + "</span>: " + message + "</li>";
			invalidFields[i].removeEventListener("keyup", showFormAllErrorMessagesOnChange);
		    invalidFields[i].addEventListener("keyup", showFormAllErrorMessagesOnChange);			

		}
		errorList.style.display = "block"; /*show*/
	}else{errorList.style.display = "none"; /*hide*/}
};

// To be added to form (on 'submit')
var formValidationSafariSupport= function( event ) {
	if ( this.checkValidity && !this.checkValidity() ) {
	    this.querySelector( ":invalid" )[0].focus(); // Optional
	    event.preventDefault();
	}
}

/* To be added to each input on validable all messages forms*/
var showFormAllErrorMessagesOnChange=function( event ) {
    var type = this.type;
    if ( /date|email|month|number|search|tel|text|time|url|week/.test ( type ) ){
      //&& event.keyCode == 13 ) { // stands for 'return' or 'enter'
        showFormAllErrorMessages.call(this);
    }
}

var get_timestamp_str=function(){
	var timestamp=new Date();
	var timestamp_str=timestamp.getFullYear()+"-"+
		pad_string((timestamp.getMonth()+1),2,"0") + "-" + pad_string(timestamp.getDate(),2,"0") + " " +
		 pad_string(timestamp.getHours(),2,"0") + ":"  + pad_string(timestamp.getMinutes(),2,"0") + 
			":"  + pad_string(timestamp.getSeconds(),2,"0");
	return timestamp_str;
}

var calculateAge=function (dateString,dateRef) {
    if(typeof(dateRef)=='undefined') dateRef = new Date();
    else dateRef=new Date(dateRef.substring(0,10));
    var birthDate = new Date(dateString);
    var age = dateRef.getFullYear() - birthDate.getFullYear();
    var m = dateRef.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && dateRef.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

var calculateAgeGeneration=function (dateString,dateRef) {
    if(typeof(dateRef)=='undefined') dateRef = new Date();
    else dateRef=new Date(dateRef.substring(0,10));
    var birthDate = new Date(dateString);
    return (dateRef.getFullYear() - birthDate.getFullYear());
}


//window.addEventListener("navigate", function(event,data){alert("navigate!");preventBack(event,data)});
//window.addEventListener('android:back',function(e) {alert("android back"); e.preventDefault();});

// cordova/phonegap, it is necessary to have the native code... and access to 
// these events, it can be done with just javascript...
document.addEventListener("backbutton", onBackKeyDown, false);
function onBackKeyDown(e) {
  alert("cordova back key down");
  e.preventDefault();
}

//keycode 27?
// event.keyCode == 27 //thats for escape 
// event.keyCode == 8 // backspace
//13 enter
/*document.addEventListener("keydown", keyDownTextField, false);
function keyDownTextField(e) {
  if(e.keyCode==27) {
  alert("You hit the esc key.");
  }
	console.log("keydown");
}*/

/* Prevent browser and mobile back button 
var preventBack=function (event, data) {
  var direction = data.state.direction;
  if (direction == 'back') {
		event.preventDefault();
		confirm_on_back();
  }
  //if (direction == 'forward') { do something else}
}*/


var confirm_on_back=function(){
	var r=confirm("Seguro que quieres cancelar?");
	if(r==true){
		alert("cancelando...");
		return true;
	}else{
		return false;
	}
}

// does not seem to work for mobile..., you need cordova/phonegap to control
// device buttons behavior
var history_api = typeof history.pushState !== 'undefined' // optional
function preventHistoryBack(){
	console.log("preventing history back");
	if ( history_api ) history.pushState(null, '', '#no-'); // optional
	else location.hash='#no-'; // push a new history state (limit)
	if ( history_api ) history.pushState(null, '', '#_'); //optional 
	else location.hash='#_'; // push another new history state (current)
	window.onhashchange=function(){
		if(location.hash == '#no-' && confirm_on_back()==false){
			if ( history_api ) history.pushState(null, '', '#_'); //optional 
			location.hash='#_'; // #_ removed, we are at #no- so push #_ again
		} 
	}
}

var confirmOnPageExit = function (e) {
    // If we haven't been passed the event get the window.event
    e = e || window.event;
    // Standardization/security:
    //  most browsers ignore msg and use a localized standard msg
    var msg = 'Desea salir?'; 
    // For IE6-8 and Firefox prior to version 4
    if (e) { e.returnValue = msg;  }
    // For Chrome, Safari, IE8+ and Opera 12+
    return msg;
};

// Turn it on - assign the function that returns the string
var preventBackExit=function(){
	window.onbeforeunload = confirmOnPageExit; // maybe use remove and add event listner
}
// Turn it off - remove the function entirely
var allowBackExit=function(){
	window.onbeforeunload = null;
}

// BASIC AJAX
// Abstraction (type and method are optional)
function ajax_request(url, callback, type, method, data) {
	if(typeof(method)==="undefined") method = "GET";
	if(typeof(type)==="undefined") type = "text";
	var xhr=new XMLHttpRequest();
	xhr.responsetype=type;
	xhr.onreadystatechange = function(){
		if (xhr.readyState ===4) { // XMLHttpRequest.DONE value
			if (xhr.status === 200) {
	            if(type=="json"){
                    var ret_json={};
                    try {
                        ret_json=JSON.parse(xhr.responseText);
                    }
                    catch(err) {
                        ret_json.error=err.message+" -- "+xhr.responseText;
                    }
	                callback(ret_json);
				}else{
	                callback(xhr.responseText);
				}
			} else {
				alert("AJAX ERROR: "+xhr.status);
			}
		}
	}
	xhr.open(method, url, true);
	if(method=="POST" && typeof(data)!='undefined') xhr.send(data)
	else xhr.send()
}


function ajax_CORS_request(url, callback, type, method, data, callback_arg) {
	if(typeof(method)==="undefined") method = "GET";
	if(typeof(type)==="undefined") type = "text";
    var xhr = new XMLHttpRequest();
    if(method=="GET" && is_local()){
        var url_append_symbol='?';
        if(url.indexOf('?')!=-1) url_append_symbol='&';
        url=url+url_append_symbol+'allow_null_CORS=true';
    }
    if ("withCredentials" in xhr) {
        //alert("cors supported, with credentials "+xhr.withCredentials); // false by default
        xhr.open(method, url, true);
    } else if (typeof XDomainRequest != "undefined") {
        xhr = new XDomainRequest(); // XDomainRequest for IE
        xhr.open(method, url);
    } else {
        alert("ERROR: Ajax with CORS is not supported by your browser");
    }
    // we presupose that any time we do POST ajax is with urlencoded data
    if(method=="POST"){
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        if(is_local()){
            var url_append_symbol='&';
            data=data+url_append_symbol+'allow_null_CORS=true';
        }
    }
	xhr.responsetype=type;
    xhr.callback_arg=callback_arg;
	xhr.onreadystatechange = function(){
		if (xhr.readyState ===4) { // XMLHttpRequest.DONE value
			if (xhr.status === 200) {
	            if(type=="json"){
                    var ret_json={};
                    try {
                        ret_json=JSON.parse(xhr.responseText);
                    }
                    catch(err) {
                        ret_json.error=err.message+" -- "+xhr.responseText;
                    }
                    ret_json.callback_arg=xhr.callback_arg;
	                callback(ret_json);
				}else{
	                callback(xhr.responseText);
				}
			} else {
				alert("AJAX ERROR: "+xhr.status+"  "+JSON.stringify(xhr));
			}
		}
	}
    xhr.withCredentials = true;
	if(method=="POST" && typeof(data)!='undefined') xhr.send(data)
	else xhr.send()
}

function ajax_request_json(url, callback) {ajax_request(url,callback,"json");}
function ajax_CORS_request_json(url, callback) {ajax_CORS_request(url,callback,"json");}

function jsonp_request(url) {
	if(url.indexOf('jsoncallback')==-1){alert("JSONP "+url+" no jsoncallback defined");}
    else{
        //alert("appending "+url);
        var script_element = document.createElement('script');
        script_element.src = url;
        document.getElementsByTagName('head')[0].appendChild(script_element);
    }
}


// TODO for sending utf-8 post use "application/json; charset=UTF-8"
// or if not json "application/octet-stream; charset=UTF-8"


// QUERY STRING location.search
var get_query_string = function () {
	var query_string = {};
	var query = window.location.search.substring(1); // query except ?
	var vars = query.split("&");
	for (var i=0;i<vars.length;i++) {
		var pair = vars[i].split("=");
		query_string[pair[0]] = pair[1];
	}
	return query_string;
};


var toggleClassBlink = function(blink_element,blink_class,blink_timeout,num_blinks){
	blink_element.classList.toggle(blink_class);
	//alert("a");
	if(num_blinks!=0)
	    setTimeout(function(){toggleClassBlink(blink_element,blink_class,blink_timeout,(num_blinks-1));},blink_timeout);
	else
		blink_element.classList.remove(blink_class);
		
}

// HAMBURGER MENU
var hamburger_menu=document.getElementById('hamburger_menu');
var hamburger_menu_content=document.getElementById('hamburger_menu_content');
var hamburger_close_button=document.getElementById('hamburger_close');
if(hamburger_close_button!=null){
	hamburger_close_button.addEventListener(clickOrTouch, function(e) {
			e.stopPropagation();
			hamburger_menu.classList.remove('open');
		});
    /* TODO Review this so that if you clickOrTouch inside hamburger it does not close... */
    var bodytag=document.getElementsByTagName('body')[0];
    bodytag.addEventListener(clickOrTouch,function(){
        hamburger_close(); 
    });
}
if(hamburger_menu!=null){
 	hamburger_menu.addEventListener(clickOrTouch, function(e) {
            //avoid closing menu when clicking inside
			e.stopPropagation();
		});   
}
var hamburger_close=function(){
	hamburger_menu.classList.remove('open');
}
var hamburger_toggle=function(e){
    if(e==undefined) e=window.event;
	e.stopPropagation();
	hamburger_menu.classList.toggle('open');
}





// Object Helpers
function objectLength(obj) {
  var result = 0;
  for(var prop in obj) {
		if (obj.hasOwnProperty(prop)) { 
			result++;
		}
  }
  return result;
}
var objectProperties=function(obj) {
    var result = [];
    for(var prop in obj) {
        if (obj.hasOwnProperty(prop)) {result.push(prop);}
   }
   return result;
}


/*
	Select a random item from an array
	Optionally provide a leave_out option
*/
var random_item=function(array, opt_leave_out){
	var item=undefined;
	var leave_out="__youWillNeverFindMe__";
	if(typeof(opt_leave_out)!=='undefined') leave_out=opt_leave_out;
	var way_out_of_infinite_loop=0;
	do{
		item = array[Math.floor(Math.random()*array.length)];
		way_out_of_infinite_loop++;
		//console.log("randomizing "+item+" leave out "+leave_out);
	}while(item==leave_out && way_out_of_infinite_loop!=1000);
	if(way_out_of_infinite_loop==1000)
		throw new Error("cognitionis random_item,  loop>1000, leave_out="+leave_out);
	return item;
}

/*
	Select a random array of items from an array
	Optionally provide a if you want to allow repetitions
*/
var random_array=function(array, num_elems, allow_repetition){
	var item=undefined;
	var items=[];
	var remaining_array=array.slice(); // copy by value
	var repetition=false;
	if(typeof(allow_repetition)!=='undefined' && allow_repetition==true)
		repetition=true;
	do{
		item = remaining_array[Math.floor(Math.random()*remaining_array.length)];
		if(items.indexOf(item)!=-1 && !repetition){continue;}
		else{items.push(item);}
	}while(items.length<num_elems);
	return items;
}

/* Shuffle the elements of an array in the same array Fisher-Yates*/
var shuffle_array=function(o){
    for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
}

var Asciify={};
Asciify.latin_map={"á":"a","à":"a","é":"e","è":"e","í":"i","ó":"o","ò":"o","ú":"u","ü":"u","ñ":"n","ç":"c"};
Asciify.asciify=function(str){return str.replace(/[^A-Za-z0-9\[\] ]/g,function(a){return Asciify.latin_map[a]||a})};
Asciify.isLatin=function(str){return str==Asciify.asciify(str)}

var get_reduced_display_name=function(display_name, max_length){
    if(typeof(max_length)=='undefined') max_length=12;
    if(display_name.length>max_length){
        var first_space_index=display_name.indexOf(" ");
        //console.log("first_space_index="+first_space_index);
        if(first_space_index!=-1 && first_space_index<max_length){
            display_name=display_name.substr(0,first_space_index);
        }else{
            display_name=display_name.substr(0,max_length);
        }
    }
    return display_name
}

var slugify=function(str){
	str=Asciify.asciify(str.toLowerCase());
    str = str.replace(/[^a-z0-9-]/gi, '-').
    replace(/-+/g, '-').
    replace(/^-|-$/g, '');
	return str;
}


