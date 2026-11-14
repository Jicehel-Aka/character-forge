# coffre_levier_porte.gd — scène d'exemple Godot 4 : un levier ouvre une porte ; un coffre s'ouvre quand on « interagit ».
# À attacher à un Node2D racine ; place plateforme_planche.png et plateforme_atlas.json à côté (res://).
# NON EXÉCUTÉ ici (voir objet_etats.gd).
extends Node2D

const ATLAS := "res://plateforme_atlas.json"
const PLANCHE := preload("res://plateforme_planche.png")

var coffre: ObjetEtats
var levier: ObjetEtats
var porte: ObjetEtats

func _creer(nom: String, position_pieds: Vector2) -> ObjetEtats:
    var o := ObjetEtats.new()
    o.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST      # pixel art : pas de lissage
    add_child(o)
    o.charger(ATLAS, PLANCHE, nom)
    o.position = position_pieds
    return o

func _ready() -> void:
    coffre = _creer("coffre", Vector2(170, 200))
    levier = _creer("levier", Vector2(230, 200))
    porte = _creer("porte", Vector2(275, 200))
    levier.etat_change.connect(_levier_change)
    coffre.etat_change.connect(func(_a, n): print("coffre : ", n))

func _levier_change(_ancien: StringName, nouveau: StringName) -> void:
    # « activation » -> « on » : ouvre la porte ; « desactivation » : la referme
    if nouveau == &"activation":
        porte.declencher(&"ouvrir")
    elif nouveau == &"desactivation":
        porte.declencher(&"fermer")

func _unhandled_input(ev: InputEvent) -> void:
    if ev.is_action_pressed("ui_accept"):
        coffre.declencher(&"interagir")      # ferme -> ouverture -> ouvert (puis ouvert -> fermeture -> ferme)
    if ev.is_action_pressed("ui_select"):
        levier.declencher(&"interagir")      # off <-> on
