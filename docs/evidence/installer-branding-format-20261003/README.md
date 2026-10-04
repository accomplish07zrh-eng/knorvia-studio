# Installer source JSON formatting receipt

The UI artifact bitmaps/previews and original evidence are preserved unchanged.
Only the production sources.json was formatted with the pinned repository
formatter after the actual CI formatting failure. JSON values are identical.
The original sources.json bytes at UI commit 1a0febaf9b362b5bcd578d396ec566bf98a33e51
remain in sources-before.json and Git; sources-after.json binds the new bytes.
The historical UI checksum continues to describe that original input; do not
rewrite it to pretend the old source was formatted. This records no new rights,
image changes, native GUI acceptance or retroactive CI success.
