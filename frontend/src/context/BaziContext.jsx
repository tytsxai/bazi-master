import React, { createContext, useContext, useState } from 'react';

const BaziContext = createContext(null);

export const BaziProvider = ({ children }) => {
    const [baziResult, setBaziResult] = useState(null);

    // You can add more derived state or specialized setters here if needed
    // For now, just a simple getter/setter for the baziResult object

    return (
        <BaziContext.Provider value={{ baziResult, setBaziResult }}>
            {children}
        </BaziContext.Provider>
    );
};

export const useBaziContext = () => {
    const context = useContext(BaziContext);
    if (!context) {
        throw new Error('useBaziContext must be used within a BaziProvider');
    }
    return context;
};
