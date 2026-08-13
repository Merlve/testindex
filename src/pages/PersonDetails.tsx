import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { motion } from 'motion/react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const PersonDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [person, setPerson] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  useEffect(() => {
    // Note: Since there is no specific backend API for person details yet,
    // this acts as a placeholder to fix the build error.
    // If you need TMDB person details, you can add an API route or fetch here.
    const fetchPerson = async () => {
      try {
        setLoading(true);
        // const response = await axios.get(`/api/meta/person/${id}`, { headers: { Authorization: token } });
        // setPerson(response.data);
        
        // Placeholder data
        setPerson({
          id,
          name: 'Person Details',
          biography: 'Details for this person will be displayed here.',
        });
      } catch (error) {
        console.error('Failed to fetch person details:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPerson();
  }, [id, token]);

  return (
    <div className="p-4 sm:p-12 min-h-screen pb-20">
      <button 
        onClick={() => navigate(-1)}
        className="mb-6 flex items-center gap-2 px-4 py-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl transition text-sm font-semibold"
      >
        <ChevronLeft size={16} />
        Back
      </button>

      {loading ? (
        <div className="animate-pulse flex flex-col gap-4">
          <div className="h-10 w-1/3 bg-black/10 dark:bg-white/10 rounded-xl"></div>
          <div className="h-32 bg-black/10 dark:bg-white/10 rounded-xl"></div>
        </div>
      ) : person ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-6"
        >
          <h1 className="text-3xl font-bold">{person.name}</h1>
          <div className="p-6 bg-black/5 dark:bg-white/5 rounded-2xl">
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              {person.biography}
            </p>
          </div>
        </motion.div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          Person not found.
        </div>
      )}
    </div>
  );
};

export default PersonDetails;
