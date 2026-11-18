// 窗口依附负责状态顺序；节点配置负责各阶段的视频和声音。
export const WINDOW_NODES = {
 windowElevator:{label:'电梯上行',mode:'triple',play:'loop',slots:{enter:'elevator-enter',loop:'elevator-run',exit:'elevator-exit'}},
 windowSit:{label:'上沿坐姿',mode:'single',play:'loop',slots:{single:'attachment-sit-idle'}},
 windowLie:{label:'上沿卧姿',mode:'single',play:'loop',slots:{single:'attachment-lie-idle'}},
 windowSitSpecial:{label:'上沿坐姿特殊',mode:'single',play:'once',slots:{single:'attachment-sit'}},
 windowLieSpecial:{label:'上沿卧姿特殊',mode:'single',play:'once',slots:{single:'attachment-lie'}},
 windowSitToLie:{label:'坐姿 → 卧姿',mode:'single',play:'once',slots:{single:'attachment-sit-to-lie'}},
 windowLieToSit:{label:'卧姿 → 坐姿',mode:'single',play:'once',slots:{single:'attachment-lie-to-sit'}}
};

export const WINDOW_STAGES = Object.fromEntries(Object.entries(WINDOW_NODES).flatMap(([id,node])=>
 Object.entries(node.slots).map(([phase,asset])=>[asset,{id,phase}])
));
