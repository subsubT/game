"""Read-only XLSX validation for the labelled C fixture; never print cell values."""
import json, sys, zipfile, xml.etree.ElementTree as ET
from pathlib import Path, PurePosixPath
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
with zipfile.ZipFile(sys.argv[1]) as z:
    strings=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        strings=[''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',ns)]
    rels={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    tables={}
    for sheet in ET.fromstring(z.read('xl/workbook.xml')).findall('m:sheets/m:sheet',ns):
        target=rels[sheet.attrib['{'+ns['r']+'}id']]
        path=target.lstrip('/') if target.startswith('/') else str(PurePosixPath('xl')/target)
        rows=[]
        for row in ET.fromstring(z.read(path)).findall('m:sheetData/m:row',ns):
            values=[]
            for cell in row.findall('m:c',ns):
                v=cell.find('m:v',ns);value=v.text if v is not None else ''
                if cell.attrib.get('t')=='s':value=strings[int(value)]
                if cell.attrib.get('t')=='inlineStr':value=''.join(cell.find('m:is',ns).itertext())
                letters=''.join(c for c in cell.attrib['r'] if c.isalpha());col=0
                for c in letters:col=col*26+ord(c)-64
                while len(values)<col:values.append('')
                values[col-1]=value
            if any(values):rows.append(values)
        tables[sheet.attrib['name']]=rows
    assert all(name in tables for name in ['안내','학생요약','회차','문항'])
    expected=int(sys.argv[3]);counts={name:len(tables[name])-1 for name in ['학생요약','회차','문항']}
    assert counts['회차']==expected and counts['문항']==expected*50,'Completion row count differs'
    assert len(tables['학생요약'][0])==7
    assert len(tables['회차'][0])==len(tables['문항'][0])==11
    scores=[float(row[3]) for row in tables['회차'][1:]]
    assert all(score==500 for score in scores),'Score differs'
    ids=[row[9] for row in tables['문항'][1:]]
    assert len(set(ids))==expected*50,'Duplicate question rows'
    assert all(row[7]=='완료' for row in tables['회차'][1:]),'Partial record exported'
    # Private names all start with C; displayed aliases do not.
    assert all(not row[1].startswith('C') for row in tables['학생요약'][1:]),'Private name exported'
    assert all(not row[2].startswith('C') for row in tables['회차'][1:]),'Private name exported'
    evidence={'sheets':list(tables),'rows':counts,'scores':scores,'uniqueQuestionRows':len(set(ids)),'partialRecordsExcluded':True,'privateStudentNamesExcluded':True,'result':'PASS'}
    Path(sys.argv[2]).write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(evidence,ensure_ascii=False))
