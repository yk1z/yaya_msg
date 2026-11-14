import * as mpegtsModule from 'mpegts.js';
import Hls from 'hls.js';
import Artplayer from 'artplayer';
import artplayerPluginDanmuku from 'artplayer-plugin-danmuku';

window.mpegts = mpegtsModule.default || mpegtsModule;
window.Hls = Hls;
window.Artplayer = Artplayer;
window.artplayerPluginDanmuku = artplayerPluginDanmuku;
