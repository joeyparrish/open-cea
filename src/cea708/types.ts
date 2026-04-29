// Copyright 2026 Joey Parrish
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// CEA-708 types and enums (CTA-708 §8)

export const Opacity = {
  Solid: 0,
  Flash: 1,
  Translucent: 2,
  Transparent: 3,
} as const;
export type Opacity = (typeof Opacity)[keyof typeof Opacity];

export const BorderType = {
  None: 0,
  Raised: 1,
  Depressed: 2,
  Uniform: 3,
  ShadowLeft: 4,
  ShadowRight: 5,
} as const;
export type BorderType = (typeof BorderType)[keyof typeof BorderType];

export const Justify = {
  Left: 0,
  Right: 1,
  Center: 2,
  Full: 3,
} as const;
export type Justify = (typeof Justify)[keyof typeof Justify];

export const Direction = {
  LeftToRight: 0,
  RightToLeft: 1,
  TopToBottom: 2,
  BottomToTop: 3,
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const DisplayEffect = {
  Snap: 0,
  Fade: 1,
  Wipe: 2,
} as const;
export type DisplayEffect = (typeof DisplayEffect)[keyof typeof DisplayEffect];

export const PenSize = {
  Small: 0,
  Standard: 1,
  Large: 2,
} as const;
export type PenSize = (typeof PenSize)[keyof typeof PenSize];

export const Offset = {
  Subscript: 0,
  Normal: 1,
  Superscript: 2,
} as const;
export type Offset = (typeof Offset)[keyof typeof Offset];

export const EdgeType = {
  None: 0,
  Raised: 1,
  Depressed: 2,
  Uniform: 3,
  LeftDropShadow: 4,
  RightDropShadow: 5,
} as const;
export type EdgeType = (typeof EdgeType)[keyof typeof EdgeType];

export const AnchorPoint = {
  TopLeft: 0,
  TopCenter: 1,
  TopRight: 2,
  MiddleLeft: 3,
  Center: 4,
  MiddleRight: 5,
  BottomLeft: 6,
  BottomCenter: 7,
  BottomRight: 8,
} as const;
export type AnchorPoint = (typeof AnchorPoint)[keyof typeof AnchorPoint];

export interface Color {
  r: number; // 0..3
  g: number; // 0..3
  b: number; // 0..3
}
