#!/usr/bin/python
#
# WSGI module to scrape III records and return them as JSON
# Supports REST syntax, as in 
#
#    /isbn/1412936373
#    /oclc/ocm61881193
#    /bibrecord/2275560
#    /title/freakonomics
#
# Supported query parameters are:
#
# opacbase= , e.g. http://laurel.lib.vt.edu/search~S7
# jsoncallback= , e.g.
#
# Godmar Back <libx.org@gmail.com>
#

import sys
# add directory in which script is located to python path
script_dir = "/".join(__file__.split("/")[:-1])
if script_dir == "":
    script_dir = "."
if script_dir not in sys.path:
    sys.path.append(script_dir)

import re, urllib, traceback
from collections import defaultdict
# older versions of Python
# from django.utils import simplejson
import simplejson

defaultopacbase = "http://addison.vt.edu/search"

def makeIIISearch(opacbase, sterm, allitems=False):
    if allitems == True:
    	 return opacbase + "/" + sterm + "/" + sterm + "/1,1,1,B/holdings&FF=" + sterm
    return opacbase + "/" + sterm + "/" + sterm + "/1,1,1,E/marc&FF=" + sterm

#
marcrecordformat = re.compile('<pre>\n(LEADER(.|\n)*)<\/pre>', re.I)
marclineformat = re.compile('^(\d{3}) (\d| )(\d| ) (.*)((?:\n[ ]{7}(.+))*)$', re.MULTILINE)
subfieldformat = re.compile('(?:|\|(\S))([^|\n]+)(?=\||$)')
locationsformat = re.compile('<!-- field [\$1] -->([\s\S]*?)<\/')
holdingsformat = re.compile('<!-- field % -->([^<]*)<')
htmltags = re.compile('<\/?[^>]*>')
nbsp = re.compile('&nbsp;|&#160;')

def parseIII(response):
    """
        Scraping III, for the umpteenth time
    """
    def clean(s):
        return nbsp.sub(" ", htmltags.sub("", s)).strip()

    try:
        marcbody = marcrecordformat.search(response).group(1)
        marc = defaultdict(list)

        for line in marclineformat.finditer(marcbody):
            (fcode, ind1, ind2, firstline, nextlines, _) = line.groups()
            nextlines = nextlines or ""
            turnnewlineintospace = fcode == '245'
            content = firstline \
                + re.sub('\n[ ]{7}', ("", " ")[turnnewlineintospace], nextlines)
            content = re.sub('\s+', ' ', content).strip()

            subfields = defaultdict(list)
            for subfield in subfieldformat.finditer(content):
                (subcode, subfieldvalue) = subfield.groups()
                subcode = subcode or 'a'
                subfields[subcode].append(subfieldvalue.strip())

            marc[fcode].append({ 'i1': ind1, 'i2': ind2, 'sf' : subfields })

        return {
            'marc': marc,
            'locations': [ clean(l.group(1)) for l in locationsformat.finditer(response) ],
            'holdings': [ clean(h.group(1)) for h in holdingsformat.finditer(response) ]
        }

    except:
        # traceback.print_exc()
        pass

def parseIIIallitems(response):
    """
        Scrapes the III view additional items page to retreive full item information.
    """
    def clean(s):
        return nbsp.sub(" ", htmltags.sub("", s)).strip()
        
    try:
        return {
            'locations': [ clean(l.group(1)) for l in locationsformat.finditer(response) ],
            'holdings': [ clean(h.group(1)) for h in holdingsformat.finditer(response) ]
        }

    except:
        pass
    
def validateIII(marc, sterm):
    def OrList(list):
        return reduce(lambda x, y: x or y, list, False)

    if not marc:
        return False

    try:
        if sterm.startswith('.b'):
            return True

        term = sterm[1:].lower()
        if sterm.startswith('i'):
            return OrList([  f['sf'].has_key('a') and f['sf']['a'][0].lower().startswith(term) \
                            for f in marc['020']]) \
                or OrList([  f['sf'].has_key('z') and f['sf']['z'][0].lower().startswith(term) \
                            for f in marc['020']]) \
                or OrList([ f['sf']['a'][0].lower().replace("-", "").startswith(term) \
                            for f in marc['022']])

        if sterm.startswith('o'):
            return OrList([ f['sf']['a'][0].lower().startswith(term) for f in marc['001']])

        if sterm.startswith('t'):
            return True # XXX

        return False
    except KeyError:
        return False
    except IndexError:
        return False

def fetch(sterm, params):
    global defaultopacbase

    opacbase = defaultopacbase
    if params.has_key('opacbase'):
        opacbase = params.get('opacbase')

    recordurl = makeIIISearch(opacbase, sterm)
    iiiresponse = urllib.urlopen(recordurl).read()
    marc = parseIII(iiiresponse)
    
    if params.has_key('allitems'):
	   if params.get('allitems') == 'true':
		  bibrecordurl = recordurl
		  recordurl = makeIIISearch(opacbase, sterm, allitems=True)
		  iiiresponse = urllib.urlopen(recordurl).read()
		  allitems = parseIIIallitems(iiiresponse)
		  recordurl = [bibrecordurl, recordurl]
		  marc['locations'] = allitems['locations']
		  marc['holdings'] = allitems['holdings']
    
    marcrecords = [ ]
    if marc and validateIII(marc['marc'], sterm):
        marcrecords.append(marc)

    return { 
        'results' : marcrecords, 
        'searchterm' : sterm,
        'recordurl' : recordurl
    }

def notfound(env, start_response):
    body = "Not Found, env = \n" \
       + ''.join(sorted([k + " -> " + str(v) + "\n" for k, v in env.items()]))

    params = dict([(urllib.unquote_plus(k), urllib.unquote_plus(v))
        for k, v in [kv.strip().split('=', 1) \
                     for kv in env['QUERY_STRING'].split('&') if '=' in kv]])

    body = body + "\nparams:\n" \
       + ''.join(sorted([k + " -> " + str(v) + "\n" for k, v in params.items()]))
    headers = [('Content-Type', 'text/plain'), \
               ('Cache-Control', 'max-age=1,must-revalidate')]
    start_response("404 Not Found", headers)
    return [body]

pathinfoformat = re.compile('/([^/]*)/(.*)')

#
# Callable 'application' is the WSGI entry point
#
def application(env, start_response):
    params = dict([(urllib.unquote_plus(k), urllib.unquote_plus(v))
        for k, v in [kv.strip().split('=', 1) \
                     for kv in env['QUERY_STRING'].split('&') if '=' in kv]])

    m = pathinfoformat.match(env['PATH_INFO'])
    (type, id) = m.groups()

    prefix = { 
        'oclc' : 'o', 
        'title' : 't', 
        'isbn' : 'i', 
        'bibrecord' : '.b'
    }

    if prefix.has_key(type):
        results = fetch(prefix[type] + id, params);
        body = simplejson.dumps(results)
        if params.has_key('jsoncallback'):
            body = params.get('jsoncallback') + "(" + body + ")"
        if params.has_key('callback'):
            body = params.get('callback') + "(" + body + ")"

        headers = [('Content-Type', 'application/javascript;charset=utf-8'), \
                   ('Cache-Control', 'max-age=1,must-revalidate')]
        start_response("200 OK", headers)
        return [body]
    
    return notfound(env, start_response)

if __name__ == '__main__':
    marc = fetch(sys.argv[1], { })
    print simplejson.dumps(marc)
