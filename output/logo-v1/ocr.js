ObjC.import('Foundation');
ObjC.import('Vision');
function run(argv) {
  const reports=[];
  for (const name of argv) {
    const url=$.NSURL.fileURLWithPath(name);
    const request=$.VNRecognizeTextRequest.alloc.init;
    request.recognitionLevel=0;
    request.recognitionLanguages=$(['zh-Hans','en-US']);
    request.usesLanguageCorrection=false;
    request.minimumTextHeight=0.015;
    const handler=$.VNImageRequestHandler.alloc.initWithURLOptions(url,$({}));
    const error=Ref();
    const success=handler.performRequestsError($([request]),error);
    const rows=[];
    if(success) {
      const observations=request.results;
      for(let i=0;i<observations.count;i++) {
        const observation=observations.objectAtIndex(i), candidates=observation.topCandidates(3), items=[];
        for(let j=0;j<candidates.count;j++) {
          const candidate=candidates.objectAtIndex(j);
          items.push({text:ObjC.unwrap(candidate.string),confidence:candidate.confidence});
        }
        rows.push({candidates:items});
      }
    }
    reports.push({file:name,success:!!success,results:rows});
  }
  return JSON.stringify(reports,null,2);
}
