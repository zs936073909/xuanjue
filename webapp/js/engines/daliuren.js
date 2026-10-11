// daliuren.js — 大六壬起课算法（离线）：月将加时/天地盘/四课/三传/天将/神煞/格局/白话
(function(global){
  const ZHI=Lunar.ZHI;
  const GAN=Lunar.GAN;
  // 地支五行 子水丑土寅木卯木辰土巳火午火未土申金酉金戌土亥水
  const WX=['水','土','木','木','土','火','火','土','金','金','土','水'];
  const WX_CODE={水:0,木:1,火:2,土:3,金:4};
  // 五行相克：金克木 木克土 土克水 水克火 火克金
  function wxKe(aWx,bWx){
    if(aWx==='金'&&bWx==='木')return true;
    if(aWx==='木'&&bWx==='土')return true;
    if(aWx==='土'&&bWx==='水')return true;
    if(aWx==='水'&&bWx==='火')return true;
    if(aWx==='火'&&bWx==='金')return true;
    return false;
  }
  function wxSheng(aWx,bWx){
    if(aWx==='金'&&bWx==='水')return true;
    if(aWx==='水'&&bWx==='木')return true;
    if(aWx==='木'&&bWx==='火')return true;
    if(aWx==='火'&&bWx==='土')return true;
    if(aWx==='土'&&bWx==='金')return true;
    return false;
  }
  // 干寄宫
  const GAN_JI={甲:2,乙:4,丙:5,丁:7,戊:5,己:7,庚:8,辛:10,壬:11,癸:1};
  // 天干五行（用于遥克/返吟墓判断）
  const GAN_WX={甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水'};
  // 五行墓（木墓未/火墓戌/土墓辰/金墓丑/水墓辰）
  const WX_MU={木:7,火:10,土:4,金:1,水:4};
  // 天干合（甲己/乙庚/丙辛/丁壬/戊癸）
  const GAN_HE={甲:'己',己:'甲',乙:'庚',庚:'乙',丙:'辛',辛:'丙',丁:'壬',壬:'丁',戊:'癸',癸:'戊'};
  // 八专日：干支同位（丙午传统不入八专，因丙寄巳非午）
  const BA_ZHUAN={甲:'寅',乙:'卯',丁:'巳',戊:'午',己:'未',庚:'申',辛:'酉',癸:'亥'};
  function ganHe(gan){return GAN_HE[gan];}
  function ganMuIdx(gan){return WX_MU[GAN_WX[gan]];}
  function isBaZhuanDay(gan,zhiIdx){return BA_ZHUAN[gan]===ZHI[zhiIdx];}
  // 天将
  const TIANJIANG=['贵人','螣蛇','朱雀','六合','勾陈','青龙','天空','白虎','太常','玄武','太阴','天后'];
  const TJ_JI={贵人:1,螣蛇:-1,朱雀:-1,六合:1,勾陈:-1,青龙:1,天空:-1,白虎:-1,太常:1,玄武:-1,太阴:1,天后:1};
  // 天将所属五行（贵人/太常/六合=土；螣蛇/朱雀=火；青龙=木；白虎=金；天空=土；玄武=水；太阴/天后=水）
  const TJ_WX={贵人:'土',螣蛇:'火',朱雀:'火',六合:'木',勾陈:'土',青龙:'木',天空:'土',白虎:'金',太常:'土',玄武:'水',太阴:'水',天后:'水'};
  // 天将方位（用于贵人昼夜顺逆起将参考）
  const TJ_GAN={贵人:'吉',螣蛇:'凶',朱雀:'凶',六合:'吉',勾陈:'凶',青龙:'吉',天空:'凶',白虎:'凶',太常:'吉',玄武:'凶',太阴:'吉',天后:'吉'};
  // 贵人地支（昼/夜）by 日干
  const GUIREN={
    '甲':{day:1,night:7},'戊':{day:1,night:7},'庚':{day:1,night:7},
    '乙':{day:0,night:8},'己':{day:0,night:8},
    '丙':{day:11,night:9},'丁':{day:11,night:9},
    '壬':{day:3,night:5},'癸':{day:3,night:5},
    '辛':{day:6,night:2}
  };
  // 类神 by 问题类型
  const LEISHEN={
    '感情关系':'六合','事业合作':'青龙','学习考试':'朱雀','出行移动':'白虎',
    '签约交易':'青龙','人际沟通':'六合','财务决策':'太常','健康倾向':'白虎',
    '失物寻找':'玄武','二选一决策':'六合','其他':'贵人'
  };
  // 地支生肖
  const SHENGXIAO=['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];
  // 地支方位（用于盘面方位标示）
  const ZHI_FANGWEI=['北','东北','东北','东','东南','东南','南','西南','西南','西','西北','西北'];
  // 卦气七元时辰（占时方位辅助）
  const ZHI_SHI=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  // 八卦方位映射（用于盘面）
  const ZHI_BAGUA={0:'坎',1:'艮',2:'艮',3:'震',4:'巽',5:'巽',6:'离',7:'坤',8:'坤',9:'兑',10:'乾',11:'乾'};
  // 五行颜色编码（用于可视化）
  const WX_COLOR={水:'#6a8aaa',木:'#6a9a6a',火:'#c45a4a',土:'#c9a86a',金:'#d4d4d4'};
  // 五行相生：金生水/水生木/木生火/火生土/土生金
  // 五行相克：金克木/木克土/土克水/水克火/火克金（详见 wxKe）

  // 古籍《大六壬指南》: "自卯至申用昼贵，自酉至寅用夜贵"
  // 卯(3)-申(8) 为昼, 酉(9)-寅(2) 为夜
  function isDayTime(zhanShiIdx){return zhanShiIdx>=3&&zhanShiIdx<=8;}

  // 起课主函数
  // date: Date; dayGz: {gan,zhi,ganIdx,zhiIdx,index}; hourGz:{...}; yueJiangIdx; zhanShiIdx
  // opts.guiRenMode: '昼夜贵人' | '夜贵人' | '甲戊庚牛羊'（默认昼夜贵人）
  // opts.sheHaiMode: '涉害取深' | '涉害取孟仲季'（默认取深）
  function qiKe(date,baZi,yueJiangIdx,zhanShiIdx,opts){
    opts=opts||{};
    const guiRenMode=opts.guiRenMode||'昼夜贵人';
    const sheHaiMode=opts.sheHaiMode||'涉害取深';
    const dayGan=baZi.day.gan, dayGanIdx=baZi.day.ganIdx, dayZhiIdx=baZi.day.zhiIdx;
    const offset=(yueJiangIdx-zhanShiIdx+12)%12;
    // 天盘[p] = 天盘神 above 地盘位p
    const tianPan=[];
    for(let p=0;p<12;p++)tianPan[p]=(p+offset)%12;
    // 日干寄宫
    const ganJi=GAN_JI[dayGan];
    // 四课
    // 第一课：上=天盘[干寄宫] 下=干寄宫(代表日干)
    const c1shang=tianPan[ganJi];
    // 第二课：上=天盘[c1shang] 下=c1shang
    const c2shang=tianPan[c1shang];
    // 第三课：上=天盘[日支] 下=日支
    const c3shang=tianPan[dayZhiIdx];
    // 第四课：上=天盘[c3shang] 下=c3shang
    const c4shang=tianPan[c3shang];
    const lessons=[
      {up:c1shang,down:ganJi,downLabel:dayGan,role:'日干(一课)'},
      {up:c2shang,down:c1shang,downLabel:ZHI[c1shang],role:'干阴(二课)'},
      {up:c3shang,down:dayZhiIdx,downLabel:ZHI[dayZhiIdx],role:'日支(三课)'},
      {up:c4shang,down:c3shang,downLabel:ZHI[c3shang],role:'支阴(四课)'}
    ];

    // 贵人
    const gr=GUIREN[dayGan];
    let day=isDayTime(zhanShiIdx);
    if(guiRenMode==='夜贵人'){day=false;}
    else if(guiRenMode==='甲戊庚牛羊'){
      // 甲戊庚用牛羊：甲/戊/庚日统一以丑(牛)为起点起天将，不再按昼夜换未
      if(['甲','戊','庚'].includes(dayGan)){
        day=true; // 强制从丑开始顺布天将
      }
    }
    const guiZhiIdx=day?gr.day:gr.night;
    const guiChengShen=tianPan[guiZhiIdx]; // 贵人乘神
    // 天将乘神表
    const tjByShen={};
    for(let i=0;i<12;i++){
      const shen=day?(guiChengShen+i)%12:(guiChengShen-i+12)%12;
      tjByShen[shen]=TIANJIANG[i];
    }
    // 给四课加天将、五行、生肖、生克关系、旺相休囚
    const monthZhiIdx=baZi.month.zhiIdx;
    lessons.forEach(l=>{
      l.upTJ=tjByShen[l.up];
      l.downTJ=tjByShen[l.down];
      l.upWX=WX[l.up];
      l.downWX=WX[l.down];
      l.upSX=SHENGXIAO[l.up];
      l.downSX=SHENGXIAO[l.down];
      l.upFW=ZHI_FANGWEI[l.up];
      l.downFW=ZHI_FANGWEI[l.down];
      l.relation=wxRelation(l.up,l.down);
      l.upWXState=wangXiang(l.up,monthZhiIdx);
      l.downWXState=wangXiang(l.down,monthZhiIdx);
    });

    // 空亡
    const xunShou=Math.floor(baZi.day.index/10)*10;
    const k1=(10-2*(xunShou/10)+12)%12, k2=(11-2*(xunShou/10)+12)%12;
    const kongWang=[k1,k2];

    // 三传：贼克法
    const isFuYin=yueJiangIdx===zhanShiIdx;
    const isFanYin=(Math.abs(yueJiangIdx-zhanShiIdx)%12)===6;
    const sanChuan=computeSanChuan(lessons,dayGan,dayGanIdx,dayZhiIdx,tianPan,tjByShen,offset,isFuYin,isFanYin,sheHaiMode);

    // 给三传补全生肖、方位、天将五行、生克链、旺相休囚
    const sc=sanChuan;
    [sc.chu,sc.zhong,sc.mo].forEach(t=>{
      t.sx=SHENGXIAO[t.idx];
      t.fw=ZHI_FANGWEI[t.idx];
      t.bg=ZHI_BAGUA[t.idx];
      t.tjWX=TJ_WX[t.tj]||'—';
      t.tjJi=TJ_GAN[t.tj]||'—';
      t.isKong=kongWang.includes(t.idx);
      t.wxState=wangXiang(t.idx,monthZhiIdx);
    });
    sc.chuToZhong=wxRelation(sc.chu.idx,sc.zhong.idx);
    sc.zhongToMo=wxRelation(sc.zhong.idx,sc.mo.idx);

    // 格局
    const geju=detectGeju(yueJiangIdx,zhanShiIdx,lessons,baZi,sanChuan);

    // 神煞
    const shenSha=computeShenSha(baZi,dayZhiIdx);

    // 类神
    const leishenName=LEISHEN[opts.questionType]||'贵人';
    let leishenShen=null;
    for(const shen in tjByShen){if(tjByShen[shen]===leishenName){leishenShen=parseInt(shen);break;}}

    // 天将落宫表（便于前端展示十二天将各自所乘神与所在地支）
    const tjList=TIANJIANG.map((name,i)=>{
      const zhi=tianJiangZhi(name,tjByShen);
      return{name,zhi,zhiIdx:zhi,chengShen:zhi>=0?ZHI[zhi]:'—',wx:TJ_WX[name],ji:TJ_GAN[name],isKong:zhi>=0&&kongWang.includes(zhi)};
    });

    return{
      yueJiang:{idx:yueJiangIdx,zhi:ZHI[yueJiangIdx],wx:WX[yueJiangIdx]},
      zhanShi:{idx:zhanShiIdx,zhi:ZHI[zhanShiIdx],wx:WX[zhanShiIdx]},
      offset,tianPan,
      dayGan,dayGanIdx,dayZhiIdx,ganJi,
      guiRen:{idx:guiZhiIdx,zhi:ZHI[guiZhiIdx],chengShen:ZHI[guiChengShen],isDay:day,label:day?'昼贵':'夜贵'},
      tjByShen,tjList,
      lessons,sanChuan,geju,shenSha,kongWang,leishenName,leishenShen,
      isFuYin,
      isFanYin,
      date,baZi
    };
  }

  // 孟仲季：寅申巳亥=孟(0)，子午卯酉=仲(1)，辰戌丑未=季(2)
  // 索引：子0丑1寅2卯3辰4巳5午6未7申8酉9戌10亥11
  function mengZhongJi(idx){
    if(idx===2||idx===8||idx===5||idx===11)return 0; // 孟
    if(idx===0||idx===6||idx===3||idx===9)return 1;   // 仲
    return 2;                                          // 季
  }
  // 涉害深度：从上神在天盘位(=下神)顺时针走到上神本位，途中受克次数
  // 传统"涉害"取受克最深者；上神 c 在天盘位 p（即下神位），地盘本位即 c
  function sheHaiDepth(upIdx,downIdx){
    if(upIdx===downIdx)return 0;
    const upWx=WX[upIdx];
    let n=0,cur=downIdx,guard=0;
    while(cur!==upIdx&&guard<12){
      // 途经地盘位 cur，若其五行克上神，则上神受克一次
      if(wxKe(WX[cur],upWx))n++;
      cur=(cur+1)%12;
      guard++;
    }
    return n;
  }

  // 三传计算（大六壬九法：贼克/比用/涉害/遥克/昴星/别责/八专/伏吟/返吟）
  function computeSanChuan(lessons,dayGan,dayGanIdx,dayZhiIdx,tianPan,tjByShen,offset,isFuYin,isFanYin,sheHaiMode){
    // 收集四课上下相克（贼=下贼上，克=上克下）
    const kes=[];
    lessons.forEach((l,i)=>{
      const uw=WX[l.up],dw=WX[l.down];
      if(wxKe(uw,dw))kes.push({idx:i,up:l.up,down:l.down,type:'克',dir:'上克下'});
      else if(wxKe(dw,uw))kes.push({idx:i,up:l.up,down:l.down,type:'贼',dir:'下贼上'});
    });
    const isGang=dayGanIdx%2===0; // 刚日(阳干)：甲丙戊庚壬
    let chosen=null,method='';
    // 古籍《大六壬指南》: "伏吟之课，先观四课有克无克。有克者，照常以贼克比用涉害法取初传；
    // 但伏吟之传不行，中传即同初传，末传取初传之冲，曰杜传。无克者，刚日取日干寄宫之上神为
    // 初传(自任格)，柔日取日支之上神为初传(自信格)，中末同上(亦为杜传)。"
    // 即伏吟有克仍走贼克法，仅中末按杜传处理；伏吟无克方用自任/自信。
    if(isFuYin && kes.length===0){
      // 伏吟无克: 自任/自信
      if(isGang){
        // 自任格：刚日取日干寄宫之上神（伏吟天盘=地盘，上神即寄宫本身）
        const c1=GAN_JI[dayGan];
        chosen={up:c1,from:0};
        method='伏吟-自任';
      }else{
        // 自信格：柔日取日支寄宫之上神（伏吟即日支本身）
        const c1=dayZhiIdx;
        chosen={up:c1,from:2};
        method='伏吟-自信';
      }
    }else if(kes.length>0){
      // 1/2/3. 贼克/比用/涉害 (含伏吟有克的情况)
      if(kes.length===1){
        chosen={up:kes[0].up,from:kes[0].idx};
        method=kes[0].type==='贼'?'重审':'元首';
      }else{
        // 多克：先取贼(下贼上)，无则取克
        let pool=kes.filter(k=>k.type==='贼');
        let baseType='贼';
        if(pool.length===0){pool=kes.filter(k=>k.type==='克');baseType='克';}
        if(pool.length===1){
          chosen={up:pool[0].up,from:pool[0].idx};
          method=baseType==='贼'?'重审(多贼取一)':'元首(多克取一)';
        }else{
          // 比用：取与日干阴阳同性者（上神idx奇偶应与日干一致）
          const ganYang=dayGanIdx%2===0;
          let bi=pool.filter(k=>(k.up%2===0)===ganYang);
          if(bi.length===1){
            chosen={up:bi[0].up,from:bi[0].idx};
            method='比用';
          }else{
            // 涉害：取受克最深者（路径克数），并列时按孟>仲>季决之
            // 比用筛后若无同性（无比用），则涉害于全部 pool
            const candidates=bi.length>0?bi:pool;
            let best=null,bestDepth=-1,bestMzj=99;
            if(sheHaiMode==='涉害取孟仲季'){
              // 传统"涉害取孟仲季"：直接按孟>仲>季选初传
              candidates.forEach(k=>{
                const mzj=mengZhongJi(k.up);
                if(best===null||mzj<bestMzj){bestMzj=mzj;best=k;}
              });
            }else{
              // 默认：涉害取深，并列孟仲季
              candidates.forEach(k=>{
                const depth=sheHaiDepth(k.up,k.down);
                const mzj=mengZhongJi(k.up);
                if(depth>bestDepth||(depth===bestDepth&&mzj<bestMzj)){
                  bestDepth=depth;bestMzj=mzj;best=k;
                }
              });
            }
            chosen={up:best.up,from:best.idx};
            method='涉害';
          }
        }
      }
      // 伏吟有克: 在贼克法 method 前加"伏吟-"以标识课体
      if(isFuYin)method='伏吟-'+method;
    }else if(isFanYin){
      // 9. 返吟法（四课无克时：天盘=地盘对冲）
      const zhiShang=tianPan[dayZhiIdx]; // 日支上神（即日支之冲）
      const muIdx=ganMuIdx(dayGan);      // 日干之墓
      if(zhiShang===muIdx){
        // 无亲格：日支上神为日干之墓，取日干寄宫之上神
        const c1=tianPan[GAN_JI[dayGan]];
        chosen={up:c1,from:0};
        method='返吟-无亲';
      }else{
        // 无依格：取日支上神为初传
        chosen={up:zhiShang,from:2};
        method='返吟-无依';
      }
    }else{
      // 4. 遥克法（四课无克：取日干与上神遥克）
      const ganWx=GAN_WX[dayGan];
      // 弹射课：日干克某课上神
      const tanShe=lessons.filter(l=>wxKe(ganWx,WX[l.up]));
      // 蒿矢课：某课上神克日干
      const haoShi=lessons.filter(l=>wxKe(WX[l.up],ganWx));
      let yaoChosen=null,yaoMethod='';
      const pickDeepest=(arr)=>{
        // 遥克涉害：取受克路径最深者，并列时孟>仲>季
        let best=arr[0],bestN=-1,bestMzj=99;
        arr.forEach(l=>{
          const depth=sheHaiDepth(l.up,l.down);
          const mzj=mengZhongJi(l.up);
          if(depth>bestN||(depth===bestN&&mzj<bestMzj)){bestN=depth;bestMzj=mzj;best=l;}
        });
        return best;
      };
      if(tanShe.length>0){
        const best=pickDeepest(tanShe);
        yaoChosen={up:best.up,from:lessons.indexOf(best)};
        yaoMethod='弹射';
      }else if(haoShi.length>0){
        const best=pickDeepest(haoShi);
        yaoChosen={up:best.up,from:lessons.indexOf(best)};
        yaoMethod='蒿矢';
      }
      if(yaoChosen){
        chosen=yaoChosen;
        method=yaoMethod;
      }else{
        // 5/6/7. 昴星/别责/八专（四课无克无遥克）
        if(isBaZhuanDay(dayGan,dayZhiIdx)){
          if(isGang){
            // 6. 别责-阳日：取日干合神(干合)之上神为初传，中末传按阴神递进（默认）
            const heGan=ganHe(dayGan);
            const heJi=GAN_JI[heGan];
            const c1=tianPan[heJi];
            chosen={up:c1,from:-1};
            method='别责';
          }else{
            // 7. 八专法：干支同位，取日支上神为初传（即干上神，因同位）
            const c1=tianPan[dayZhiIdx];
            chosen={up:c1,from:2};
            method='八专';
          }
        }else if(isGang){
          // 5. 昴星-阳日(虎视格)：取酉上神为初传
          const c1=tianPan[9]; // 酉=9
          chosen={up:c1,from:-1};
          method='虎视';
        }else{
          // 5. 昴星-阴日(冬蛇掩目格)：取从魁(酉)下神为初传
          // 下神=地盘位p使得天盘[p]=9
          let p=-1;
          for(let i=0;i<12;i++){if(tianPan[i]===9){p=i;break;}}
          chosen={up:p,from:-1};
          method='冬蛇掩目';
        }
      }
    }

    // 计算中末传
    const c1=chosen.up;
    let c2=tianPan[c1];
    let c3=tianPan[c2];
    // 伏吟杜传格：天盘=地盘，致中传=初传，传不行，末传取初传之冲
    if(isFuYin && c2===c1){
      c3=(c1+6)%12;
      method=method+'(杜传)';
    }
    // 返吟课：即使四课有克走了贼克法，method 仍需带"返吟"以标识课体
    if(isFanYin && !method.startsWith('返吟')){
      method='返吟-'+method;
    }
    return{
      chu:{zhi:ZHI[c1],idx:c1,tj:tjByShen[c1],wx:WX[c1]},
      zhong:{zhi:ZHI[c2],idx:c2,tj:tjByShen[c2],wx:WX[c2]},
      mo:{zhi:ZHI[c3],idx:c3,tj:tjByShen[c3],wx:WX[c3]},
      method,fromLesson:chosen.from
    };
  }

  // 格局
  function detectGeju(yueJiangIdx,zhanShiIdx,lessons,baZi,sanChuan){
    const list=[];
    const m=sanChuan.method;
    // 伏吟/返吟（结构标志或三传法均可能命中，合并去重）
    if(yueJiangIdx===zhanShiIdx||m.startsWith('伏吟'))list.push('伏吟课');
    if(Math.abs(yueJiangIdx-zhanShiIdx)%12===6||m.startsWith('返吟'))list.push('返吟课');
    if(m.includes('元首'))list.push('元首课');
    if(m.includes('重审'))list.push('重审课');
    if(m==='比用')list.push('比用课');
    if(m==='涉害')list.push('涉害课');
    if(m==='弹射'||m==='蒿矢')list.push('遥克课');
    if(m==='虎视'||m==='冬蛇掩目')list.push('昴星课');
    if(m==='别责')list.push('别责课');
    // 八专：三传法为八专，或日干支同位（甲寅/乙卯/丁巳/戊午/己未/庚申/辛酉/癸亥）
    if(m==='八专'||isBaZhuanDay(baZi.day.gan,baZi.day.zhiIdx))list.push('八专课');
    return list.length?list:['常课'];
  }

  // 神煞
  // 古籍：寅午戌见卯, 申子辰见酉, 巳酉丑见午, 亥卯未见子（咸池/桃花）
  // 即桃花 = 三合中间字 - 3 (mod 12)
  function computeShenSha(baZi,dayZhiIdx){
    const sanhe=[[8,0,4],[2,6,10],[5,9,1],[11,3,7]]; // 申子辰/寅午戌/巳酉丑/亥卯未
    let ma=-1,tao=-1,gai=-1;
    for(const g of sanhe){
      if(g.includes(dayZhiIdx)){
        // 驿马=三合第一字之冲
        ma=(g[0]+6)%12;
        // 桃花(咸池)=三合中间字之逆三位
        tao=(g[1]+9)%12; // 等价于 (g[1]-3+12)%12
        // 华盖=三合末字
        gai=g[2];
        break;
      }
    }
    return{
      yima:ma>=0?ZHI[ma]:'—',taohua:tao>=0?ZHI[tao]:'—',huagai:gai>=0?ZHI[gai]:'—',
      taiSui:ZHI[baZi.year.zhiIdx],yueJian:ZHI[baZi.month.zhiIdx]
    };
  }

  // 白话生成（基于盘面结构化数据，全部标注传统规则参考）
  function plainLang(ke,questionType){
    const sc=ke.sanChuan;
    const chuTJ=sc.chu.tj, moTJ=sc.mo.tj;
    const chuJi=TJ_JI[chuTJ], moJi=TJ_JI[moTJ];
    // 倾向
    let tendency='宜观察';
    if(chuJi>0&&moJi>0)tendency='宜主动';
    else if(chuJi<0&&moJi<0)tendency='宜谨慎';
    else if(chuJi>0&&moJi<0)tendency='宜速决';
    else if(chuJi<0&&moJi>0)tendency='宜等待';
    // 风险
    const risks=[];
    if(ke.kongWang.includes(sc.chu.idx))risks.push('初传落空亡，所谋恐虚');
    if(chuTJ==='玄武')risks.push('初传乘玄武，防欺瞒失窃');
    if(chuTJ==='白虎')risks.push('初传乘白虎，防病灾口舌');
    if(ke.isFanYin)risks.push('返吟课，事多反复动摇');
    if(ke.isFuYin)risks.push('伏吟课，事多伏匿不动');
    // 机会
    const opps=[];
    if(chuTJ==='贵人')opps.push('贵人临传，可得助力');
    if(chuTJ==='青龙')opps.push('青龙临传，有财喜文书之喜');
    if(chuTJ==='六合'&&questionType==='感情关系')opps.push('六合临传，关系有和合之象');
    if(!ke.kongWang.includes(sc.mo.idx)&&moJi>0)opps.push('末传吉将，结局有望');
    // 对方/环境
    let env='第三课(日支)上神 '+ZHI[ke.lessons[2].up]+' 乘 '+ke.lessons[2].upTJ+'，反映所问对象或环境状态。';
    // 建议
    const doAct=[],dontAct=[];
    if(tendency==='宜主动'){doAct.push('可推进当前计划');dontAct.push('不宜久拖生变');}
    else if(tendency==='宜等待'){doAct.push('宜暂缓观察，待时而动');dontAct.push('不宜强行推进');}
    else if(tendency==='宜谨慎'){doAct.push('宜核实信息、防备风险');dontAct.push('不宜贸然承诺或签约');}
    else {doAct.push('宜多方观察、收集信息');dontAct.push('不宜仓促决断');}
    if(risks.length)dontAct.push(risks[0]);
    // 观察信号
    const signals=[];
    signals.push('初传 '+sc.chu.zhi+'('+sc.chu.tj+') → 中传 '+sc.zhong.zhi+'('+sc.zhong.tj+') → 末传 '+sc.mo.zhi+'('+sc.mo.tj+')');
    if(ke.leishenShen!==null)signals.push('类神「'+ke.leishenName+'」乘 '+ZHI[ke.leishenShen]+(ke.kongWang.includes(ke.leishenShen)?'（落空亡，力量减弱）':''));
    signals.push('空亡：'+ZHI[ke.kongWang[0]]+ZHI[ke.kongWang[1]]);
    return{
      state:'当前状态以初传 '+sc.chu.zhi+' 乘 '+chuTJ+' 为主，'+(chuJi>0?'稍有利':'多阻逆')+'；末传 '+sc.mo.zhi+' 乘 '+moTJ+' 示结局 '+(moJi>0?'向好':'未尽如人意')+'。',
      tendency,risks,opps,env,doAct,dontAct,signals,
      reviewDays:7
    };
  }

  // 计算两支的五行关系：返回 '生'/'克'/'同'/'无'
  function wxRelation(aIdx,bIdx){
    const a=WX[aIdx],b=WX[bIdx];
    if(a===b)return '同';
    if(wxSheng(a,b))return '生'; // a 生 b
    if(wxSheng(b,a))return '被生'; // a 被 b 生
    if(wxKe(a,b))return '克'; // a 克 b
    if(wxKe(b,a))return '被克'; // a 被 b 克
    return '无';
  }
  // 天将所在宫位（顺逆推算后落地支）
  function tianJiangZhi(tjName,tjByShen){
    for(const shen in tjByShen){if(tjByShen[shen]===tjName)return parseInt(shen);}
    return -1;
  }
  // 旺相休囚死：以月令(月建)为我，同我者旺，我生者相，生我者休，克我者囚，我克者死
  // 古籍《五行大义》《渊海子平》："春木旺、火相、土死、金囚、水休。"
  // 即：木(月令)克土 → 土死；金克木(月令) → 金囚
  // 返回地支在当前月令下的旺衰状态
  function wangXiang(xIdx, monthZhiIdx){
    const xWx=WX[xIdx];
    const mWx=WX[monthZhiIdx];
    if(xWx===mWx)return '旺';          // 同我者旺
    if(wxSheng(mWx,xWx))return '相';   // 我生者相：月令生target
    if(wxSheng(xWx,mWx))return '休';   // 生我者休：target生月令
    if(wxKe(mWx,xWx))return '死';      // 我克者死：月令克target
    if(wxKe(xWx,mWx))return '囚';      // 克我者囚：target克月令
    return '平';
  }
  // 课体格局详解：根据九宗门与盘面特征生成详细说明
  function explainGeju(ke){
    const sc=ke.sanChuan;
    const m=sc.method;
    const list=[];
    // 课体说明（取自《大六壬大全》《大六壬指南》）
    const EXPLAIN={
      '元首':'元首课：上克下，君得位，臣服从。事多顺理，吉则大吉，凶则大凶。',
      '重审':'重审课：下贼上，臣强君弱。事有反复，宜再审慎，不可轻动。',
      '重审(多贼取一)':'重审课(多贼取一)：四课中多下贼上，取最先一课。事多反复阻力。',
      '元首(多克取一)':'元首课(多克取一)：四课中多上克下，取最先一课。',
      '比用':'比用课：阴阳同类曰比。多克取与日干阴阳同性者为用。事有比和之象。',
      '涉害':'涉害课：涉，渡也；害，克也。多克且同比用，取受克最深者为用。事多艰难。',
      '弹射':'弹射课(遥克)：日干克上神，如弹射远取。事远而缓，所谋难成。',
      '蒿矢':'蒿矢课(遥克)：上神克日干，如蒿矢弱射。事虽来势弱，但久亦有损。',
      '虎视':'昴星-虎视格(刚日)：四课无克无遥，取酉上神。如虎视眈眈，事多惊恐。',
      '冬蛇掩目':'昴星-冬蛇掩目格(柔日)：取酉下神。如冬蛇掩目，事隐伏不彰。',
      '别责':'别责课(八专日刚日)：取日干合神之上神。事有倚托他人之象。',
      '八专':'八专课(八专日柔日)：干支同位，取日支上神。事体专一，无悔有咎。',
      '伏吟-自任':'伏吟-自任格(刚日)：天盘=地盘，刚日取日干寄宫。事自任己力，伏匿不动。',
      '伏吟-自信':'伏吟-自信格(柔日)：柔日取日支。事自信守常，伏而不行。',
      '返吟-无依':'返吟-无依格：天盘=地盘对冲，无克时取日支上神。事多动摇，反复无依。',
      '返吟-无亲':'返吟-无亲格：日支上神为日干之墓。事无亲援，孤军作战。'
    };
    // 找最匹配的说明
    let matched=null;
    for(const k in EXPLAIN){
      if(m===k||m.startsWith(k)){matched=EXPLAIN[k];break;}
    }
    if(matched)list.push({k:'取法',v:matched});
    // 三传吉凶链
    const chuJi=TJ_JI[sc.chu.tj]||0, zhongJi=TJ_JI[sc.zhong.tj]||0, moJi=TJ_JI[sc.mo.tj]||0;
    const jiLabel=ji=>ji>0?'吉':ji<0?'凶':'平';
    let chain='初传 '+sc.chu.zhi+'乘'+sc.chu.tj+'('+jiLabel(chuJi)+')';
    chain+=' → 中传 '+sc.zhong.zhi+'乘'+sc.zhong.tj+'('+jiLabel(zhongJi)+')';
    chain+=' → 末传 '+sc.mo.zhi+'乘'+sc.mo.tj+'('+jiLabel(moJi)+')';
    list.push({k:'传变',v:chain});
    // 三传吉凶总评（综合初/中/末，以初末为主、中传为辅）
    const allJi=[chuJi,zhongJi,moJi];
    const jiCnt=allJi.filter(x=>x>0).length, xiongCnt=allJi.filter(x=>x<0).length;
    if(chuJi>0&&moJi>0)list.push({k:'总评',v:(jiCnt===3?'初中末皆吉':'初末皆吉'+(zhongJi<0?'、中传凶':'')+'，事可成。宜主动推进。')});
    else if(chuJi<0&&moJi<0)list.push({k:'总评',v:(xiongCnt===3?'初中末皆凶':'初末皆凶'+(zhongJi>0?'、中传吉':'')+'，事难成。宜避守不动。')});
    else if(chuJi<0&&moJi>0)list.push({k:'总评',v:'初凶末吉，先难后易，宜坚持。'});
    else if(chuJi>0&&moJi<0)list.push({k:'总评',v:'初吉末凶，先易后难，宜速决。'});
    else list.push({k:'总评',v:'吉凶参半，宜观变而行。'});
    // 空亡提示
    const kongChuan=[sc.chu.isKong,sc.zhong.isKong,sc.mo.isKong];
    const kongCount=kongChuan.filter(Boolean).length;
    if(kongCount>0){
      const kongList=[];
      if(sc.chu.isKong)kongList.push('初传');
      if(sc.zhong.isKong)kongList.push('中传');
      if(sc.mo.isKong)kongList.push('末传');
      list.push({k:'空亡',v:kongList.join('、')+'落空亡，力量减弱。'+(kongCount>=2?' 多传落空，所谋恐全虚。':'')});
    }
    // 类神状态
    if(ke.leishenShen!==null){
      const leishenKong=ke.kongWang.includes(ke.leishenShen);
      list.push({k:'类神',v:'类神「'+ke.leishenName+'」乘'+ZHI[ke.leishenShen]+(leishenKong?'（落空亡，主所问之事无力）':'（不空，有力）')});
    }
    return list;
  }
  global.DaLiuRen={
    qiKe,plainLang,
    GAN_JI,TIANJIANG,TJ_JI,TJ_WX,TJ_GAN,GUIREN,LEISHEN,WX,WX_COLOR,
    GAN_WX,WX_MU,GAN_HE,BA_ZHUAN,
    SHENGXIAO,ZHI_FANGWEI,ZHI_BAGUA,
    ganHe,ganMuIdx,isBaZhuanDay,
    wxKe,wxSheng,wxRelation,isDayTime,
    mengZhongJi,sheHaiDepth,
    tianJiangZhi,
    wangXiang,explainGeju
  };
})(window);
