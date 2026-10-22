// SPDX-License-Identifier: MIT
// KAMUCL adapter around the attributed MIT skinview3d model, not HMCL/FCL geometry.
import { Group, Mesh, type Material, type Texture } from 'three'
import { SkinObject, CapeObject } from './vendor/skinview3d/model'

export class PreviewPlayer extends Group {
  readonly skin = new SkinObject()
  readonly cape = new CapeObject()
  constructor() {
    super()
    this.skin.position.y = 24
    this.cape.position.set(0, 24, -2)
    this.cape.rotation.set(Math.PI / 18, Math.PI, 0)
    this.cape.visible = false
    this.add(this.skin, this.cape)
  }
  setCape(texture: Texture | null): void {
    this.cape.map = texture
    this.cape.visible = !!texture
  }
  pose(seconds: number, walking: number, yaw: number, idleStrength = 1): void {
    this.rotation.set(0, yaw, 0)
    const idle = (1 - walking) * idleStrength
    const breath = Math.sin(seconds * 2.1)
    this.position.y = breath * .1 * idle
    const angle = Math.cos(seconds * 4.71) * Math.PI / 4 * walking
    const sway = Math.sin(seconds * 1.3) * .035 * idle
    const armTilt = Math.PI * .02 + breath * .025 * idle
    this.skin.leftArm.rotation.set(angle + sway, 0, armTilt)
    this.skin.rightArm.rotation.set(-angle - sway, 0, -armTilt)
    this.skin.leftLeg.rotation.set(-angle, 0, 0)
    this.skin.rightLeg.rotation.set(angle, 0, 0)
    this.skin.head.rotation.set(Math.sin(seconds * .8) * .018 * idle, Math.sin(seconds * .6) * .035 * idle, 0)
  }
  dispose(): void {
    const materials = new Set<Material>()
    this.traverse(object => {
      if (!(object instanceof Mesh)) return
      object.geometry.dispose()
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
    })
    for (const material of materials) material.dispose()
    this.removeFromParent()
  }
}
