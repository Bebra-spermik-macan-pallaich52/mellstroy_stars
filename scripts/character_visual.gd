extends AnimatedSprite2D

## Disable this after replacing the marker with directional sprite-sheet frames.
@export var rotate_placeholder: bool = true

@onready var facing_marker: Sprite2D = get_parent().get_node_or_null("FacingMarker")


func update_state(direction: StringName, moving: bool) -> void:
	var state := "walk_" if moving else "idle_"
	play(StringName(state + String(direction)))
	var facing_angle: float = 0.0
	match direction:
		&"left": facing_angle = PI / 2.0
		&"up": facing_angle = PI
		&"right": facing_angle = -PI / 2.0
	rotation = facing_angle if rotate_placeholder else 0.0
	if facing_marker != null:
		facing_marker.rotation = facing_angle
