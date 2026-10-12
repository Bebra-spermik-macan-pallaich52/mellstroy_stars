extends CanvasLayer

@onready var player: PrototypePlayer = get_parent().get_node("Player")
@onready var state_label: Label = $Overlay/Footer/State


func _process(_delta: float) -> void:
	var direction_text: String
	match player.last_direction:
		&"up": direction_text = "вверх"
		&"left": direction_text = "влево"
		&"right": direction_text = "вправо"
		_: direction_text = "вниз"
	state_label.text = "Взгляд: %s  •  %s" % [direction_text, player.sprite.animation]
