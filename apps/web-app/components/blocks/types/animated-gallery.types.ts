import type { MotionValue } from 'motion/react';

export interface ContainerScrollContextValue {
  scrollYProgress: MotionValue<number>;
  isWebKit: boolean;
}
