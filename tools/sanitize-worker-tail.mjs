// Do not persist/print request URLs, headers, bodies, stack traces or raw errors.
let buffer='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{
  buffer+=chunk;
  for(;;){
    const begin=buffer.indexOf('{');if(begin<0){buffer='';return;}
    let depth=0,quoted=false,escaped=false,end=-1;
    for(let i=begin;i<buffer.length;i++){
      const c=buffer[i];
      if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
      if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&!--depth){end=i+1;break;}
    }
    if(end<0)return;
    const raw=buffer.slice(begin,end);buffer=buffer.slice(end);
    try{
      const event=JSON.parse(raw);
      for(const entry of event.logs||[]){
        const [label,value]=entry.message||[];
        if(!['OAuth internal error','Worker internal error'].includes(label)||!value||typeof value!=='object')continue;
        const safe={};
        if(/^[a-z-]{1,40}$/.test(value.stage||''))safe.stage=value.stage;
        if(/^[A-Za-z]{1,40}$/.test(value.name||''))safe.name=value.name;
        if(Number.isInteger(value.status))safe.status=value.status;
        if(/^[A-Z_]{1,50}$/.test(value.code||''))safe.code=value.code;
        console.log(JSON.stringify({diagnostic:label,...safe}));
      }
    }catch{}
  }
});
