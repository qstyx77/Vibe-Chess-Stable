import type { Config } from "tailwindcss";

export default {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'Arial', 'Helvetica', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
        pixel: ['var(--font-press-start-2p)', 'monospace'],
      },
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 0px)', 
  			sm: 'calc(var(--radius) - 0px)'  
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
        'fadeInOut': {
          '0%': { opacity: '0', transform: 'scale(0.8) translateY(20px)' },
          '20%': { opacity: '1', transform: 'scale(1.05) translateY(0)' },
          '80%': { opacity: '1', transform: 'scale(1) translateY(0)' },
          '100%': { opacity: '0', transform: 'scale(0.8) translateY(20px)' },
        },
        'pixel-title-flash': {
          '0%, 49.9%': { 
            textShadow: `
              3px 3px 0px hsl(var(--background)), 
              -3px 3px 0px hsl(var(--background)), 
              3px -3px 0px hsl(var(--background)), 
              -3px -3px 0px hsl(var(--background)),
              3px 0px 0px hsl(var(--background)),
              -3px 0px 0px hsl(var(--background)),
              0px 3px 0px hsl(var(--background)),
              0px -3px 0px hsl(var(--background))
            ` 
          },
          '50%, 99.9%': { 
            textShadow: `
              3px 3px 0px hsl(var(--primary)), 
              -3px 3px 0px hsl(var(--primary)), 
              3px -3px 0px hsl(var(--primary)), 
              -3px -3px 0px hsl(var(--primary)),
              3px 0px 0px hsl(var(--primary)),
              -3px 0px 0px hsl(var(--primary)),
              0px 3px 0px hsl(var(--primary)),
              0px -3px 0px hsl(var(--primary))
            `
          },
        },
        'capture-pattern-flash': {
          '0%, 100%': { opacity: '0', backgroundSize: '40px 40px', backgroundImage: 'repeating-linear-gradient(45deg, hsl(var(--primary)) 0, hsl(var(--primary)) 10px, hsl(var(--secondary)) 10px, hsl(var(--secondary)) 20px)' },
          '50%': { opacity: '0.6', backgroundSize: '80px 80px' },
        },
        'check-pattern-flash': {
          '0%, 100%': { opacity: '0', backgroundSize: '20px 20px', backgroundImage: 'repeating-linear-gradient(0deg, hsl(var(--destructive)) 0, hsl(var(--destructive)) 5px, transparent 5px, transparent 10px), repeating-linear-gradient(90deg, hsl(var(--destructive)) 0, hsl(var(--destructive)) 5px, transparent 5px, transparent 10px)' },
          '50%': { opacity: '0.7', backgroundSize: '40px 40px'},
        },
        'checkmate-pattern-flash': {
          '0%': { opacity: '0', backgroundSize: '100% 100%', backgroundImage: 'repeating-conic-gradient(hsl(var(--accent)) 0% 25%, hsl(var(--background)) 0% 50%)' },
          '50%': { opacity: '0.7', backgroundSize: '200% 200%' },
          '100%': { opacity: '0', backgroundSize: '100% 100%'},
        },
        'piece-slide-in': {
          '0%': { transform: 'scale(0.6) translateY(-20px) rotate(-10deg)', opacity: '0' },
          '20%': { transform: 'scale(0.7) translateY(-10px) rotate(-5deg)', opacity: '1' },
          '70%': { transform: 'scale(1.1) translateY(2px) rotate(3deg)', opacity: '1' },
          '100%': { transform: 'scale(1) translateY(0) rotate(0deg)', opacity: '1' },
        },
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
        'flash-check': 'fadeInOut 1.5s ease-in-out forwards',
        'flash-checkmate': 'fadeInOut 2.5s ease-in-out forwards',
        'pixel-title-flash': 'pixel-title-flash 1.5s steps(2, jump-none) infinite',
        'capture-pattern-flash': 'capture-pattern-flash 2.25s ease-in-out forwards',
        'check-pattern-flash': 'check-pattern-flash 2.25s ease-in-out forwards',
        'checkmate-pattern-flash': 'checkmate-pattern-flash 5.25s ease-in-out forwards',
        'animate-piece-slide-in': 'piece-slide-in 0.7s cubic-bezier(0.25, 0.1, 0.25, 1.5)', 
  		}
  	}
  },
  plugins: [
    require('tailwindcss-animate'),
    function({ addUtilities }) {
      const newUtilities = {
        '.transform-style-preserve-3d': {
          'transform-style': 'preserve-3d',
        },
        '.backface-hidden': {
          'backface-visibility': 'hidden',
        },
      }
      addUtilities(newUtilities)
    }
  ]
}  satisfies Config;

    