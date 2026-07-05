import JobCard from './JobCard.jsx';
import Skeleton from './Skeleton.jsx';

export default function JobList({ jobs, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {jobs.map((job) => (
        <div key={job.id} className="animate-fade-in">
          <JobCard job={job} />
        </div>
      ))}
    </div>
  );
}
