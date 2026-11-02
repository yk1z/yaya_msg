"""Prepare a static photo archive for data.gnz.hk; never upload or change the source."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import re
import shutil


def build(source, output, members_file):
    source = source.resolve(strict=True)
    output = output.resolve()
    if output == source or source in output.parents:
        raise ValueError('Output must be outside the source archive')
    members_data = json.loads(members_file.read_text(encoding='utf-8-sig'))
    members = members_data if isinstance(members_data, list) else members_data['roomId']
    names = {}
    for member in members:
        names.setdefault(member['ownerName'], []).append(member)
    ambiguous = sorted(name for name, entries in names.items() if len(entries) > 1)
    archive = {}
    copied = set()
    row_count = 0
    for manifest in sorted(source.glob('*公式照/下载清单.csv')):
        group = manifest.parent.name.removesuffix('公式照')
        for row in csv.DictReader(manifest.open(encoding='utf-8-sig', newline='')):
            year, month = int(row['year']), int(re.fullmatch(r'(\d{1,2})月', row['period'])[1])
            if not 2000 <= year <= 2100 or not 1 <= month <= 12:
                raise ValueError('Invalid date in ' + str(manifest))
            photo = (source / row['saved_path'].replace('\\', '/')).resolve(strict=True)
            if source not in photo.parents:
                raise ValueError('Photo is outside source archive')
            suffix = photo.suffix.lower()
            if suffix not in ('.jpg', '.jpeg', '.png', '.webp'):
                raise ValueError('Unsupported photo format')
            digest = hashlib.sha256(photo.read_bytes()).hexdigest()
            relative = f'images/{digest[:2]}/{digest}{suffix}'
            target = output / relative
            if relative not in copied:
                target.parent.mkdir(parents=True, exist_ok=True)
                if not target.exists() or target.stat().st_size != photo.stat().st_size:
                    shutil.copyfile(photo, target)
                copied.add(relative)
            entry = {'date': f'{year:04d}.{month:02d}', 'group': group,
                     'team': row['category'], 'path': relative}
            entries = archive.setdefault(row['member'].strip(), [])
            if entry not in entries:
                entries.append(entry)
            row_count += 1
    if not row_count:
        raise ValueError('No archive manifests found')
    for entries in archive.values():
        entries.sort(key=lambda entry: (entry['date'], entry['group'], entry['team'], entry['path']), reverse=True)
    index = {'version': 1, 'ambiguousNames': ambiguous, 'members': archive}
    output.mkdir(parents=True, exist_ok=True)
    (output / 'index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    summary = {'sourceRows': row_count, 'photoEntries': sum(map(len, archive.values())),
               'uniqueImages': len(copied), 'memberNames': len(archive),
               'imageBytes': sum((output / path).stat().st_size for path in copied),
               'unmatchedNames': sorted(set(archive) - set(names)),
               'ambiguousNames': ambiguous}
    (output.parent / 'profile-photos-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in summary.items() if key not in ('unmatchedNames', 'ambiguousNames')}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--members', type=Path, required=True)
    args = parser.parse_args()
    build(args.source, args.output, args.members)
