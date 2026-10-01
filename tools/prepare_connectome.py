"""Placeholder for a documented offline connectome-to-runtime conversion pipeline.

Input: a locally prepared FlyWire/BANC edge list or selected neuron circuit.
Output: compact typed arrays that can be loaded by the browser worker.

This deliberately does not download or redistribute FlyWire data. Use the official
FlyWire access/licensing workflow and create a local derived asset.
"""
from pathlib import Path
import csv, json, sys

def main():
    if len(sys.argv) != 3:
        print("usage: prepare_connectome.py edges.csv output.json")
        raise SystemExit(2)
    src, dst = map(Path, sys.argv[1:])
    rows=[]
    with src.open(newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if all(k in r for k in ('source','target','weight')):
                rows.append({'source':int(r['source']),'target':int(r['target']),'weight':float(r['weight'])})
    dst.write_text(json.dumps({'version':1,'edges':rows}, separators=(',',':')), encoding='utf-8')
    print(f"wrote {len(rows)} edges to {dst}")
if __name__ == '__main__': main()
