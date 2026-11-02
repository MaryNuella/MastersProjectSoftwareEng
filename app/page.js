import Link from "next/link";
export default function Home() {
  return (
    <main className="landing">
      <div className="landing-top"><div className="eyebrow">
        MIVA OPEN UNIVERSITY · MASTER OF INFORMATION TECHNOLOGY
      </div>
      <Link href="/documentation">Research documentation</Link></div>
      <section className="hero"><div className="eyebrow">A DETERMINISTIC APPROACH TO SOFTWARE TEST DESIGN</div>
      <h1>
        Design and Implementation of a Rule-Based Automated Test Case Generation
        and Validation Framework for Web Applications
      </h1>
      <p className="lead">
        Turn structured requirements into explainable test cases. Inspect every
        rule, independently validate each result, and measure the evidence.
      </p>
      <Link className="button" href="/dashboard">
        Open research workspace →
      </Link>
      </section><div className="grid three">
        <article>
          <span className="number">01</span>
          <h2>Specify Requirements</h2>
          <p>
            Define typed fields and explicit constraints in a persistent project
            repository.
          </p>
        </article>
        <article>
          <span className="number">02</span>
          <h2>Generate &amp; Validate</h2>
          <p>
            Apply equivalence partitioning and boundary-value analysis. Check
            correctness, completeness and traceability independently.
          </p>
        </article>
        <article>
          <span className="number">03</span>
          <h2>Evaluate Results</h2>
          <p>
            Run reproducible benchmarks and record actual manual design
            measurements for comparison.
          </p>
        </article>
      </div>
      <section className="method-note"><h2>Two techniques. An inspectable chain of evidence.</h2><p><strong>Equivalence partitioning</strong> selects representatives of valid and invalid input classes. <strong>Boundary-value analysis</strong> examines values at and immediately around declared limits. Every case retains its requirement, rule and expected outcome.</p></section>
      <p className="muted">
        Deterministic JavaScript rules · Versioned datasets · Transparent
        research evidence
      </p>
      <Link href="/documentation">Read the documentation</Link>
    </main>
  );
}
