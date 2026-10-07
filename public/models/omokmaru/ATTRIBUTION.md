# Omokmaru 3D avatars / 오목마루 3D 아바타

The wardrobe portraits in `/images/omokmaru/avatars/` are rendered captures of the same adapted in-game models. The credits and licenses below also apply to those portraits. Saved avatar IDs are retained independently of their current display names.

## Male collection / 남성 아바타

The four male avatars use two original male VRoid sample bodies, faces, hairstyles, trousers and humanoid skeletons. They are not recolored versions of the previous female models.

- **HairSample_Male** → `male-casual.glb`: original file https://github.com/madjin/vrm-samples/blob/master/vroid/beta/HairSample_Male.vrm
- **Sakurada Fumiriya**, the original adult version → `male-tailored.glb`: original file https://github.com/madjin/vrm-samples/blob/master/vroid/beta/Sakurada_Fumiriya.vrm
- Creator: **VRoid Project / pixiv Inc.**
- License: Creative Commons CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/
- Official HairSample_Male license confirmation: https://vroid.pixiv.help/hc/en-us/articles/4402614652569-Do-VRoid-Studio-s-sample-models-come-with-conditions-of-use
- Official Sakurada Fumiriya identity and license: https://vroid.pixiv.help/hc/en-us/articles/360014788554-Sakurada-Fumiriya
- Both downloaded source files also declare `licenseName: CC0` in their embedded VRM metadata.

Adaptations authored for Omokmaru:

- **Rowan / 로언 (B, `sylvie`):** HairSample_Male; forest-colored hoodie, a short ranger cape, leaf pin and leather crossbody bag.
- **Leon / 레온 (A, `apron`):** Sakurada Fumiriya; blond hair, an ivory tailcoat, articulated long sleeves, lapels and a gold chain.
- **Noah / 노아 (A, `serin`):** Sakurada Fumiriya; dark hair, round glasses, navy coat and blue-gray scarf.
- **Astra / 아스트라 (S, `astra`):** Sakurada Fumiriya; silver hair, a long navy uniform, gold shoulder ornaments, a star circlet and a gently moving royal cape.

Original face and eye textures, alpha channels, skin weights and skeletons are retained. Unused VRM preview images and normal/emissive maps ignored by the unlit renderer were removed. The two 2048px body/clothing color maps in each asset were resized to 1024px PNG; face and eye maps were not resized. Existing articulated idle/win/lose choreography is applied to the original male humanoid joints. The short sleeves under the tailored coat were removed from the clothing mesh; the skin mesh is unchanged.

## Luna / 루나 and Seraphine / 세라핀

Base character: **Victoria Rubin, VRoid Project**

- Original file: https://github.com/madjin/vrm-samples/blob/master/vroid/beta/Victoria_Rubin.vrm
- Original VRoid Hub model: https://hub.vroid.com/characters/4593660874193246717/models/2541762389476121920
- License: Creative Commons CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/
- Luna retains the original face, body geometry, outer clothing and skeleton, with Omokmaru's rose-pink hair tint, stage orientation and articulated poses.
- Seraphine retains her opal court gown, layered satin overskirt, filigree crown, swept feather vanes, suspended gems and animated constellation ornaments, authored for Omokmaru on the same licensed base.
- The retired `rose` / Luna twilight selection is migrated to Luna; it is not a separate selectable character.

## Aurelia / 아우렐리아 (S+)

Aurelia is an additional character built from the same **Victoria Rubin / VRoid Project** CC0 base (`luna.glb`) credited above. Luna, Seraphine and Petal remain separate character options.

- The source model's single side ponytail strands are copied into two mirrored, independently swaying blond ponytails, with newly authored rose ribbon ties and a small pearl comb.
- The ankle-length rose dress, layered overskirt, ivory apron, floral embroidery, gold stitching, scalloped hems and back sash are new geometry authored for Omokmaru, taking the long apron-dress silhouette of Petal as the visual reference.
- Articulated idle/win/lose choreography uses the existing Luna joint rig. The captured wardrobe portrait is rendered from this same adapted in-game character.

## Petal / 페탈

Base character: **Rain Rig (CC) Blender Foundation | studio.blender.org**

- Original: https://studio.blender.org/characters/rain/v3/
- License: Creative Commons Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/
- Omokmaru adaptation: rose dress, embroidered apron, corset, sleeves, floral accessories, earrings, web skeleton, facial morphs, idle/win/lose clips, and restored legs.
- Geometry was simplified to 56,971 total triangles while retaining morph targets, textures, skeleton and clips.

The Blender Foundation does not endorse this adaptation. The adapted character is distributed under CC BY 4.0.

## Legacy bundled models / 이전 배포 모델

The following files remain credited for existing bundled assets; they are no longer selected by the current avatar catalog.

### `apron.glb` and `ribbon.glb`

- `Vivi.vrm` → `apron.glb`: previous Millie and Sylvie bodies.
- `Darkness_Shibu.vrm` → `ribbon.glb`: previous Serin and Astra bodies.
- Source directory: https://github.com/madjin/vrm-samples/tree/master/vroid/beta
- Creator: VRoid Project / pixiv Inc.; embedded VRM license: CC0 1.0.
- Official license information: https://vroid.pixiv.help/hc/en-us/articles/4402614652569-Do-VRoid-Studio-s-sample-models-come-with-conditions-of-use
