import TestimonialsColumn from "./TestimonialsColumns";
import { motion } from "motion/react";
import testimonials from "../i18n/locales/testimonials.json";
import { useTranslation } from "../i18n/i18n";
import { useTheme } from "../hooks/useTheme";
import { useMemo } from "react";

// Fisher-Yates shuffle algorithm for randomizing array
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const Testimonials: React.FC<{ locale: string }> = ({ locale }) => {
  const { t } = useTranslation('index.testimonials');
  const { colors } = useTheme();
  
  // Mix testimonials from all languages randomly
  const mixedTestimonials = useMemo(() => {
    // Collect all testimonials from all languages
    const allTestimonials: any[] = [];
    Object.keys(testimonials).forEach((lang) => {
      const langTestimonials = testimonials[lang as keyof typeof testimonials];
      if (Array.isArray(langTestimonials)) {
        allTestimonials.push(...langTestimonials);
      }
    });
    
    // Shuffle them randomly
    return shuffleArray(allTestimonials);
  }, []); // Empty dependency array - shuffle once on mount
  
  const firstColumn = mixedTestimonials.slice(0, 2);
  const secondColumn = mixedTestimonials.slice(2, 4);
  const thirdColumn = mixedTestimonials.slice(4, 9);
  return (
    <section className="bg-background relative">

      <div className="container z-10 mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          viewport={{ once: true }}
          className="flex flex-col items-center justify-center max-w-[540px] mx-auto"
        >
          <div className="flex justify-center">
            <div className="border py-1 px-4 rounded-lg" style={{ color: colors.text.primary }}>{t('title')}</div>
          </div>

          <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold tracking-tighter mt-5" style={{ color: colors.text.primary }}>
           {t('subtitle')}
          </h2>
          <p className="text-center mt-5 opacity-75" style={{ color: colors.text.primary }}>
            {t('description')}
          </p>
        </motion.div>

        <div 
          className="flex justify-center gap-6 mt-10 [mask-image:linear-gradient(to_bottom,transparent,black_25%,black_75%,transparent)] max-h-[740px] overflow-hidden" 
          style={{ 
            color: colors.text.primary,
            willChange: 'transform',
            transform: 'translateZ(0)', // Force hardware acceleration on container
          }}
        >
          <TestimonialsColumn testimonials={firstColumn} duration={15} />
          <TestimonialsColumn testimonials={secondColumn} className="hidden md:block" duration={19} />
          <TestimonialsColumn testimonials={thirdColumn} className="hidden lg:block" duration={17} />
        </div>
      </div>
    </section>
  );
};

export default Testimonials;