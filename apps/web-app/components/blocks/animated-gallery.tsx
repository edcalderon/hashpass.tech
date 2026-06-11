'use client';

import * as React from 'react';
import {
  type HTMLMotionProps,
  type MotionValue,
  type Variants,
  motion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import { cn } from '@/lib/utils';

interface ContainerScrollContextValue {
  scrollYProgress: MotionValue<number>;
}

const SPRING_CONFIG = {
  type: 'spring',
  stiffness: 100,
  damping: 16,
  mass: 0.75,
  restDelta: 0.005,
  duration: 0.3,
} as const;

const blurVariants: Variants = {
  hidden: { filter: 'blur(10px)', opacity: 0 },
  visible: { filter: 'blur(0px)', opacity: 1 },
};

const ContainerScrollContext = React.createContext<ContainerScrollContextValue | undefined>(undefined);

function useContainerScrollContext() {
  const context = React.useContext(ContainerScrollContext);
  if (!context) {
    throw new Error('useContainerScrollContext must be used within a ContainerScroll Component');
  }
  return context;
}

export const ContainerScroll = ({
  children,
  className,
  style,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement>) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: scrollRef });
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 55,
    damping: 22,
    restDelta: 0.001,
  });

  return (
    <ContainerScrollContext.Provider value={{ scrollYProgress: smoothProgress }}>
      <div
        ref={scrollRef}
        className={cn('relative min-h-[120vh]', className)}
        style={{
          perspective: '1000px',
          perspectiveOrigin: 'center top',
          transformStyle: 'preserve-3d',
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    </ContainerScrollContext.Provider>
  );
};
ContainerScroll.displayName = 'ContainerScroll';

export const ContainerSticky = ({
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('sticky left-0 top-0 min-h-[30rem] w-full overflow-hidden', className)}
    style={{
      perspective: '1000px',
      perspectiveOrigin: 'center top',
      transformStyle: 'preserve-3d',
      transformOrigin: '50% 50%',
      ...style,
    }}
    {...props}
  />
);
ContainerSticky.displayName = 'ContainerSticky';

export const GalleryContainer = ({
  children,
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & HTMLMotionProps<'div'>) => {
  const { scrollYProgress } = useContainerScrollContext();
  const rotateX = useTransform(scrollYProgress, [0, 0.55], [62, 0]);
  const scale = useTransform(scrollYProgress, [0.45, 0.88], [1.15, 1]);
  // Phase 2: columns fan out horizontally once the 3D tilt settles
  const columnGap = useTransform(scrollYProgress, [0.72, 1], ['8px', '52px']);

  return (
    <motion.div
      className={cn('relative grid size-full grid-cols-3 gap-2 rounded-2xl', className)}
      style={{ rotateX, scale, columnGap, transformStyle: 'preserve-3d', perspective: '1000px', ...style }}
      {...props}
    >
      {children}
    </motion.div>
  );
};
GalleryContainer.displayName = 'GalleryContainer';

export const GalleryCol = ({
  className,
  style,
  yRange = ['0%', '-10%'],
  xRange = ['0%', '0%'],
  ...props
}: HTMLMotionProps<'div'> & { yRange?: string[]; xRange?: string[] }) => {
  const { scrollYProgress } = useContainerScrollContext();
  const y = useTransform(scrollYProgress, [0.5, 0.88], yRange);
  // Phase 2: outer columns slide outward to form horizontal panorama
  const x = useTransform(scrollYProgress, [0.72, 1], xRange);

  return (
    <motion.div
      className={cn('relative flex w-full flex-col gap-2', className)}
      style={{ y, x, ...style }}
      {...props}
    />
  );
};
GalleryCol.displayName = 'GalleryCol';

export const ContainerStagger = React.forwardRef<HTMLDivElement, HTMLMotionProps<'div'>>(
  ({ className, viewport, transition, ...props }, ref) => (
    <motion.div
      className={cn('relative', className)}
      ref={ref}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, ...viewport }}
      transition={{ staggerChildren: transition?.staggerChildren ?? 0.18, ...transition }}
      {...props}
    />
  )
);
ContainerStagger.displayName = 'ContainerStagger';

export const ContainerAnimated = React.forwardRef<HTMLDivElement, HTMLMotionProps<'div'>>(
  ({ className, transition, ...props }, ref) => (
    <motion.div
      ref={ref}
      className={cn(className)}
      variants={blurVariants}
      transition={transition ?? SPRING_CONFIG}
      {...props}
    />
  )
);
ContainerAnimated.displayName = 'ContainerAnimated';
