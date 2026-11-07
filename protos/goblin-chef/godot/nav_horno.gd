extends RefCounted
class_name NavHorno

## Hornea la malla de navegación en el hilo principal. En la web no hay hilos.


static func hornear(region: NavigationRegion3D, al_terminar: Callable) -> void:
	var nav := NavigationMesh.new()
	nav.agent_radius = 0.25
	nav.agent_height = 1.0
	nav.agent_max_climb = 0.25
	nav.agent_max_slope = 35.0
	nav.cell_size = 0.25
	nav.cell_height = 0.25
	nav.region_min_size = 1.0
	nav.sample_partition_type = NavigationMesh.SAMPLE_PARTITION_MONOTONE
	nav.set_parsed_geometry_type(NavigationMesh.PARSED_GEOMETRY_STATIC_COLLIDERS)
	nav.set_source_geometry_mode(NavigationMesh.SOURCE_GEOMETRY_ROOT_NODE_CHILDREN)
	region.navigation_mesh = nav
	if not region.bake_finished.is_connected(al_terminar):
		region.bake_finished.connect(al_terminar, CONNECT_ONE_SHOT)
	region.bake_navigation_mesh(false)
