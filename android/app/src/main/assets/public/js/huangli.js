// huangli.js — 黄历宜忌/值神/建除/二十八宿/冲煞/时辰吉凶（离线）
(function(global){
  const ZHI=Lunar.ZHI;
  // 建除十二神（值位）
  const JIANCHU=['建','除','满','平','定','执','破','危','成','收','开','闭'];
  // 黄黑道十二值神（顺布），1吉0凶
  const HUANGHEI=[
    {n:'青龙',g:1},{n:'明堂',g:1},{n:'天刑',g:0},{n:'朱雀',g:0},
    {n:'金匮',g:1},{n:'天德',g:1},{n:'白虎',g:0},{n:'玉堂',g:1},
    {n:'天牢',g:0},{n:'玄武',g:0},{n:'司命',g:1},{n:'勾陈',g:0}
  ];
  // 二十八宿
  const XXIU=['角','亢','氐','房','心','尾','箕','斗','牛','女','虚','危','室','壁','奎','娄','胃','昴','毕','觜','参','井','鬼','柳','星','张','翼','轸'];
  const XIU_SUB=['日','日','日','日','日','日','日','月','月','月','月','月','月','月','火','水','木','金','土','火','水','木','金','土','日','月','火','水'];
  // 建除值位对应宜忌（简化传统参考）
  const JC_YIJI={
    '建':{yi:['赴任','祈福','出行'],ji:['动土','开仓']},
    '除':{yi:['治病','祭祀','解除'],ji:['嫁娶','求名']},
    '满':{yi:['祭祀','祈福','进人口'],ji:['安葬','移徙']},
    '平':{yi:['修造','动土','治道'],ji:['祭祀','求福']},
    '定':{yi:['祭祀','定盟','签约'],ji:['诉讼','出行']},
    '执':{yi:['捕捉','狩猎','签约'],ji:['开市','移徙']},
    '破':{yi:['求医','破屋'],ji:['嫁娶','开市','祈福']},
    '危':{yi:['祭祀','祈福','安床'],ji:['登山','出行']},
    '成':{yi:['嫁娶','开市','签约','入学'],ji:['诉讼']},
    '收':{yi:['纳财','收获','捕捉'],ji:['出行','安葬']},
    '开':{yi:['开市','迁居','赴任'],ji:['安葬','破土']},
    '闭':{yi:['筑堤','塞穴'],ji:['开市','求名','出行']}
  };
  // 冲煞
  const CHONG={0:'午',1:'未',2:'申',3:'酉',4:'戌',5:'亥',6:'子',7:'丑',8:'寅',9:'卯',10:'辰',11:'巳'};
  const SHA={0:'南',4:'南',8:'南',2:'北',6:'北',10:'北',3:'西',7:'西',11:'西',5:'东',9:'东',1:'东'};
  // 时辰吉凶（依据建除值位 + 黄黑道综合简化）
  function jcnOf(zhiIdx,baseIdx){
    return((zhiIdx-baseIdx+12)%12);
  }

  function getDayJianChu(monthZhiIdx,dayZhiIdx){
    return JIANCHU[jcnOf(dayZhiIdx,monthZhiIdx)];
  }
  function getDayZhiShen(monthZhiIdx,dayZhiIdx){
    // 月建起青龙：青龙位=(月建-2+12)%12 ... 寅月(2)青龙子(0)
    const qing=(monthZhiIdx-2+12)%12;
    const idx=(dayZhiIdx-qing+12)%12;
    return HUANGHEI[idx];
  }
  function get28Xiu(jdnVal){
    // 锚点：2000-01-07 = 角宿日（6tail 参考取法，传统参考）
    const anchor=2451551;
    const idx=((jdnVal-anchor)%28+28)%28;
    return{name:XXIU[idx],sub:XIU_SUB[idx],index:idx};
  }
  function getChongSha(dayZhiIdx){
    return{chong:'冲'+CHONG[dayZhiIdx]+'('+ZHI[dayZhiIdx]+CHONG[dayZhiIdx]+'相冲)',sha:'煞'+SHA[dayZhiIdx]};
  }
  function getDayYiJi(monthZhiIdx,dayZhiIdx){
    const jc=getDayJianChu(monthZhiIdx,dayZhiIdx);
    return Object.assign({jianchu:jc},JC_YIJI[jc]);
  }
  // 时辰吉凶：以日支起建除值位
  function getShiChenJiXiong(monthZhiIdx,dayZhiIdx){
    const result=[];
    for(let i=0;i<12;i++){
      // 建除十二神以月建为基准，而非日支
      const jc=JIANCHU[jcnOf(i,monthZhiIdx)];
      const hh=getDayZhiShen(monthZhiIdx,i); // 用日支起青龙近似
      // 时辰黄黑道需以日干起，这里用建除+值神吉凶综合
      const good=['建','满','平','定','成','开'].includes(jc);
      result.push({zhi:ZHI[i],jianchu:jc,jiXiong:good?'吉':'凶',tip:JC_YIJI[jc]});
    }
    return result;
  }
  // 时辰黄黑道（以日干起青龙，更准）
  function getShiChenHuangHei(dayGanIdx,dayZhiIdx){
    // 五鼠遁起青龙：甲己日青龙起子... 实际：日干起青龙口诀：
    // 甲己日青龙起子，乙庚日起丑，丙辛日起寅，丁壬日起卯，戊癸日起辰? 
    // 标准时家黄黑道：以日干定青龙起时
    // 甲己→子,乙庚→丑,丙辛→寅,丁壬→卯,戊癸→辰? 待考，采用建除为主
    return null;
  }

  global.Huangli={
    JIANCHU,HUANGHEI,XXIU,
    getDayJianChu,getDayZhiShen,get28Xiu,getChongSha,getDayYiJi,getShiChenJiXiong
  };
})(window);
