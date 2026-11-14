# objet_etats.gd — Godot 4 : machine à états d'un objet (coffre, levier, porte, monstre...) pilotée par l'atlas de character-forge.
# NON EXÉCUTÉ ici (pas de Godot dans l'environnement de génération) : écrit d'après l'API Godot 4.x, à essayer et corriger au besoin.
#
# Entrées : plateforme_planche.png + plateforme_atlas.json (meta.gameData). Aucune ressource .tres à fabriquer : les animations
# (SpriteFrames) sont construites au chargement à partir de l'atlas ; durées, boucle, état suivant et transitions viennent de gameData.
class_name ObjetEtats
extends AnimatedSprite2D

signal etat_change(ancien: StringName, nouveau: StringName)
signal etat_termine(etat: StringName)      # fin d'une animation non bouclée (avant le passage à l'état suivant)

var donnees: Dictionary = {}               # gameData de CET objet
var etat: StringName = &""
var _evenements: Dictionary = {}           # "etat/evenement" -> état d'arrivée

# nom_objet : clé dans gameData.objets (ex. "coffre")
func charger(chemin_atlas: String, texture: Texture2D, nom_objet: String) -> void:
    var atlas = JSON.parse_string(FileAccess.get_file_as_string(chemin_atlas))
    donnees = atlas["meta"]["gameData"]["objets"][nom_objet]
    var sf := SpriteFrames.new()
    sf.remove_animation(&"default")
    for id in donnees["etats"]:
        var e: Dictionary = donnees["etats"][id]
        sf.add_animation(id)
        sf.set_animation_loop(id, e["boucle"])
        var duree_ms: float = e["duree_ms"][0] if e["duree_ms"][0] > 0 else 1000.0
        sf.set_animation_speed(id, 1000.0 / duree_ms)         # durées uniformes par état
        for i in e["images"]:
            var f: Dictionary = atlas["frames"]["%s_%s_%02d" % [e["animation"], e["tag"].rsplit("_", true, 1)[1], i]]["frame"]
            var at := AtlasTexture.new()
            at.atlas = texture
            at.region = Rect2(f["x"], f["y"], f["w"], f["h"])
            sf.add_frame(id, at)
    for t in donnees["transitions"]:
        _evenements["%s/%s" % [t["de"], t["evenement"]]] = t["vers"]
    sprite_frames = sf
    centered = false
    # l'ancre (pieds) devient l'origine du nœud : on place le nœud au sol, sur l'objet
    offset = -Vector2(donnees["ancre"]["x"], donnees["ancre"]["y"])
    animation_finished.connect(_fin_animation)
    aller_a(StringName(donnees["etat_initial"]))

func aller_a(nouveau: StringName) -> void:
    var ancien := etat
    etat = nouveau
    play(nouveau)
    if donnees["etats"][nouveau]["statique"]:
        pause()                                   # une seule image : rien à animer
    etat_change.emit(ancien, nouveau)

# déclenche un événement du gameData (« interagir », « activer », « ouvrir »...) ; renvoie false s'il n'a pas d'effet dans cet état
func declencher(evenement: StringName) -> bool:
    var cle := "%s/%s" % [etat, evenement]
    if not _evenements.has(cle):
        return false
    aller_a(StringName(_evenements[cle]))
    return true

func _fin_animation() -> void:
    etat_termine.emit(etat)
    var suivant = donnees["etats"][etat]["suivant"]
    if suivant != null:
        aller_a(StringName(suivant))

# collision de l'état courant : "solide", "traversable", "dangereux", "declencheur" ou "aucune"
func collision() -> String:
    return donnees["etats"][etat]["collision"]

# hurtbox de l'état courant, en pixels locaux (origine = ancre)
func hurtbox() -> Rect2:
    var h = donnees["etats"][etat]["hurtbox"]
    return Rect2(h["x"] - donnees["ancre"]["x"], h["y"] - donnees["ancre"]["y"], h["w"], h["h"])
