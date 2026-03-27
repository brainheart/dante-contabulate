# dante-contabulate

Static contabulate app for Dante's Divina Commedia in Italian.

## Build data

Run:

```sh
python3 scripts/build_data.py
```

The script downloads Project Gutenberg eBook `#1000`, caches it at
`source_text/pg1000.txt`, parses canticles/cantos/terzine, and writes the
static JSON payload into `docs/`.

If network access is unavailable, place the Gutenberg text at
`source_text/pg1000.txt` and rerun with:

```sh
python3 scripts/build_data.py --skip-download
```
