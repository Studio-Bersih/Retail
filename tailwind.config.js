/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{html,js,ts,svelte}'],
    plugins: [require('daisyui')],
    daisyui: {
        themes: [
            {
                bersih: {
                    'primary':          '#C2622A',
                    'primary-content':  '#ffffff',
                    'secondary':        '#9C7E63',
                    'accent':           '#E8A87C',
                    'neutral':          '#3D2B1F',
                    'base-100':         '#FFFFFF',
                    'base-200':         '#FAF8F5',
                    'base-300':         '#F5F0E8',
                    'base-content':     '#3D2B1F',
                    'success':          '#3D7A5C',
                    'warning':          '#D4900A',
                    'error':            '#B94040',
                    'info':             '#3b82f6'
                }
            },
            {
                'bersih-dark': {
                    'primary':          '#C2622A',
                    'primary-content':  '#ffffff',
                    'secondary':        '#9C7E63',
                    'accent':           '#E8A87C',
                    'neutral':          '#E8C9A8',
                    'base-100':         '#2C1E12',
                    'base-200':         '#221710',
                    'base-300':         '#1A120B',
                    'base-content':     '#E8C9A8',
                    'success':          '#4ade80',
                    'warning':          '#fbbf24',
                    'error':            '#f87171',
                    'info':             '#60a5fa'
                }
            }
        ]
    }
}
