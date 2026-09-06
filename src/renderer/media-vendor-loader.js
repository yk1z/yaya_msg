import * as mpegtsModule from 'mpegts.js';
import Hls from 'hls.js';
import Artplayer from 'artplayer';
import artplayerPluginDanmuku from 'artplayer-plugin-danmuku';
import DPlayer from 'dplayer';
import * as pinyinPro from 'pinyin-pro';

const mpegts = mpegtsModule.default || mpegtsModule;

window.mpegts = mpegts;
window.Hls = Hls;
window.Artplayer = Artplayer;
window.artplayerPluginDanmuku = artplayerPluginDanmuku;
window.DPlayer = DPlayer;
window.pinyinPro = pinyinPro;
