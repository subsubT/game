"""Read-only exported Google workbook QA; never print private cell text."""
import json, sys, zipfile, xml.etree.ElementTree as ET
from pathlib import Path, PurePosixPath
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as z:
    strings=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        strings=[''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',ns)]
    rels={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    tables={}
    for sheet in ET.fromstring(z.read('xl/workbook.xml')).findall('m:sheets/m:sheet',ns):
        target=rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        path=target.lstrip('/') if target.startswith('/') else str(PurePosixPath('xl')/target)
        rows=[]
        for row in ET.fromstring(z.read(path)).findall('m:sheetData/m:row',ns):
            values=[]
            for cell in row.findall('m:c',ns):
                assert cell.attrib.get('t')!='e','Unexpected spreadsheet error'
                v=cell.find('m:v',ns);value=v.text if v is not None else ''
                if cell.attrib.get('t')=='s':value=strings[int(value)]
                if cell.attrib.get('t')=='inlineStr':value=''.join(cell.find('m:is',ns).itertext())
                col=0
                for c in ''.join(c for c in cell.attrib['r'] if c.isalpha()):col=col*26+ord(c)-64
                while len(values)<col:values.append('')
                values[col-1]=value
            if any(values):rows.append(values)
        tables[sheet.attrib['name']]=rows
    assert all(n in tables for n in ['안내','학생요약','회차','문항'])
    summary,runs,questions=tables['학생요약'],tables['회차'],tables['문항']
    assert len(summary)==2 and len(runs)==2 and len(questions)==54,'Unexpected record count'
    assert float(summary[1][2])==530 and float(summary[1][3])==530 and float(summary[1][9])==1
    assert float(runs[1][3])==530 and float(runs[1][12])==30 and float(runs[1][16])==500
    assert runs[1][11]=='complete' and float(runs[1][15])==0
    assert len(set(r[9] for r in questions[1:]))==53,'Duplicate answer rows'
    assert sum(r[11]=='기본 학습' for r in questions[1:])==50
    assert sum(r[11]=='최종 스테이지' for r in questions[1:])==3
    assert all('최종후보' not in str(c) and '최종격리가상' not in str(c) for t in [summary,runs,questions] for r in t for c in r),'Private name exported'
    evidence={'result':'PASS','summaryRows':1,'sessionRows':1,'basicQuestionRows':50,'finalQuestionRows':3,'uniqueQuestionRows':53,'basicScore':500,'finalScore':30,'combinedScore':530,'privateStudentNamesExcluded':True,'errors':0}
    Path(sys.argv[2]).write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(evidence))
